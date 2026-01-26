// Integration tests for handlers with real database
// Tests the full handler → DB flow using PGlite
// Uses shared database instances with TRUNCATE for speed

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from 'jsr:@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  adminOr,
  createCmsHandler,
  createJwtPayload,
  ownedBy,
  signJwt,
} from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import { hashPassword, PasswordProvider } from '../auth/mod.ts';

// Test CSRF secret (long enough to pass validation)
const TEST_CSRF_SECRET = 'test-csrf-secret-for-integration-tests-min-32-chars';
const AUTH_SECRET = 'test-auth-secret-must-be-at-least-32-characters-long';

// ============================================================================
// Test Schema - Simple blog schema for testing
// ============================================================================

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  bio: text('bio'),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  authorId: integer('author_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));

// Admin users table for auth testing
const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
});

const schema = { users, posts, usersRelations, postsRelations };
const schemaWithAuth = { ...schema, adminUsers };

// ============================================================================
// Test Helpers
// ============================================================================

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

// ============================================================================
// Basic Integration Tests (shared PGlite instance)
// ============================================================================

Deno.test('integration: basic CRUD tests', async (t) => {
  // Create single PGlite instance for all basic tests
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Create tables once
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`);
  }

  // Helper to create handler
  function createHandler() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
    });
  }

  await t.step('dashboard renders table list', async () => {
    const handler = createHandler();
    const request = new Request('http://localhost/admin');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Dashboard');
    assertStringIncludes(html, 'Users');
    assertStringIncludes(html, 'Posts');
  });

  await t.step('list view shows empty table', async () => {
    await resetDb();
    const handler = createHandler();
    const request = new Request('http://localhost/admin/users');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Users');
    assertStringIncludes(html, 'No records found');
  });

  await t.step('create form renders with CSRF token', async () => {
    const handler = createHandler();
    const request = new Request('http://localhost/admin/users/new');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Create Users');
    assertStringIncludes(html, 'name="_csrf"');
    assertStringIncludes(html, 'name="email"');
    assertStringIncludes(html, 'name="name"');
  });

  await t.step('create record via POST', async () => {
    await resetDb();
    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const formData = createFormData({
      _csrf: csrfToken,
      email: 'test@example.com',
      name: 'Test User',
      bio: 'A test user',
    });

    const request = new Request('http://localhost/admin/users/new', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 303);
    assertStringIncludes(
      response.headers.get('Location') ?? '',
      '/admin/users/',
    );

    const users_result = await db.select().from(users);
    assertEquals(users_result.length, 1);
    assertEquals(users_result[0]?.email, 'test@example.com');
    assertEquals(users_result[0]?.name, 'Test User');
  });

  await t.step('create fails without CSRF token', async () => {
    await resetDb();
    const handler = createHandler();

    const formData = createFormData({
      email: 'test@example.com',
      name: 'Test User',
    });

    const request = new Request('http://localhost/admin/users/new', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid or expired form');

    const users_result = await db.select().from(users);
    assertEquals(users_result.length, 0);
  });

  await t.step('read view shows record', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'view@example.com',
      name: 'View Test',
    });

    const handler = createHandler();
    const request = new Request('http://localhost/admin/users/1');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'view@example.com');
    assertStringIncludes(html, 'View Test');
    assertStringIncludes(html, 'Edit');
    assertStringIncludes(html, 'Delete');
  });

  await t.step('edit form shows current values', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'edit@example.com',
      name: 'Edit Test',
      bio: 'Original bio',
    });

    const handler = createHandler();
    const request = new Request('http://localhost/admin/users/1/edit');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'edit@example.com');
    assertStringIncludes(html, 'Edit Test');
    assertStringIncludes(html, 'Original bio');
    assertStringIncludes(html, 'name="_csrf"');
  });

  await t.step('update record via POST', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'update@example.com',
      name: 'Before Update',
    });

    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const formData = createFormData({
      _csrf: csrfToken,
      email: 'updated@example.com',
      name: 'After Update',
      bio: 'New bio',
    });

    const request = new Request('http://localhost/admin/users/1', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 303);

    const users_result = await db.select().from(users);
    assertEquals(users_result.length, 1);
    assertEquals(users_result[0]?.email, 'updated@example.com');
    assertEquals(users_result[0]?.name, 'After Update');
    assertEquals(users_result[0]?.bio, 'New bio');
  });

  await t.step('delete record via POST', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'delete@example.com',
      name: 'To Delete',
    });

    let users_result = await db.select().from(users);
    assertEquals(users_result.length, 1);

    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const formData = createFormData({
      _csrf: csrfToken,
    });

    const request = new Request('http://localhost/admin/users/1/delete', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 303);
    assertStringIncludes(
      response.headers.get('Location') ?? '',
      '_flash=delete_success',
    );

    users_result = await db.select().from(users);
    assertEquals(users_result.length, 0);
  });

  await t.step('delete fails without CSRF token', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'nodelete@example.com',
      name: 'Should Not Delete',
    });

    const handler = createHandler();

    const formData = createFormData({});

    const request = new Request('http://localhost/admin/users/1/delete', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 303);
    assertStringIncludes(
      response.headers.get('Location') ?? '',
      '_flash=delete_error',
    );

    const users_result = await db.select().from(users);
    assertEquals(users_result.length, 1);
  });

  await t.step('list view shows records', async () => {
    await resetDb();
    await db.insert(users).values([
      { email: 'user1@example.com', name: 'User One' },
      { email: 'user2@example.com', name: 'User Two' },
      { email: 'user3@example.com', name: 'User Three' },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/users');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'user1@example.com');
    assertStringIncludes(html, 'User One');
    assertStringIncludes(html, 'user2@example.com');
    assertStringIncludes(html, 'user3@example.com');
  });

  await t.step('foreign key relation in create form', async () => {
    await resetDb();
    await db.insert(users).values([
      { email: 'author1@example.com', name: 'Author One' },
      { email: 'author2@example.com', name: 'Author Two' },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/posts/new');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Author One');
    assertStringIncludes(html, 'Author Two');
    assertStringIncludes(html, 'authorId');
  });

  await t.step('create post with foreign key', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'author@example.com',
      name: 'Post Author',
    });

    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const formData = createFormData({
      _csrf: csrfToken,
      title: 'Test Post',
      body: 'Post content',
      authorId: '1',
    });

    const request = new Request('http://localhost/admin/posts/new', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);

    assertEquals(response.status, 303);

    const posts_result = await db.select().from(posts);
    assertEquals(posts_result.length, 1);
    assertEquals(posts_result[0]?.title, 'Test Post');
    assertEquals(posts_result[0]?.authorId, 1);
  });

  await t.step('404 for non-existent record', async () => {
    await resetDb();
    const handler = createHandler();
    const request = new Request('http://localhost/admin/users/999');
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step('404 for non-existent table', async () => {
    const handler = createHandler();
    const request = new Request('http://localhost/admin/nonexistent');
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step('authentication check', async () => {
    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
      isAuthenticated: () => false,
    });

    const request = new Request('http://localhost/admin');
    const response = await handler(request);

    assertEquals(response.status, 403);
  });

  await t.step('list view displays flash message from URL', async () => {
    await resetDb();
    await db.insert(users).values({ email: 'test@example.com', name: 'Test' });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/users?_flash=delete_success',
    );
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Record deleted successfully');
  });

  await t.step('detail view displays flash message from URL', async () => {
    await resetDb();
    await db.insert(users).values({ email: 'test@example.com', name: 'Test' });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/users/1?_flash=update_forbidden',
    );
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(
      html,
      'You do not have permission to update this record',
    );
  });

  // Cleanup
  await client.close();
});

// ============================================================================
// JWT Auth Integration Tests (shared PGlite instance with auth tables)
// ============================================================================

Deno.test('integration: JWT auth tests', async (t) => {
  // Create single PGlite instance for all auth tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  // Create tables once
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users RESTART IDENTITY CASCADE`,
    );
  }

  // Helper to create handler with auth
  function createAuthHandler(extraOptions = {}) {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({
          db,
          usersTable: adminUsers,
          identityField: 'email',
          passwordField: 'passwordHash',
          roleField: 'role',
        }),
      },
      policies: 'dangerously-open',
      ...extraOptions,
    });
  }

  await t.step('redirects unauthenticated to login', async () => {
    await resetDb();
    const handler = createAuthHandler();

    const request = new Request('http://localhost/admin');
    const response = await handler(request);

    assertEquals(response.status, 302);
    assertEquals(response.headers.get('Location'), '/admin/login');
  });

  await t.step('login page renders', async () => {
    const handler = createAuthHandler();

    const request = new Request('http://localhost/admin/login');
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get('Content-Type'),
      'text/html; charset=utf-8',
    );

    const html = await response.text();
    assertStringIncludes(html, 'form');
    assertStringIncludes(html, 'identity');
    assertStringIncludes(html, 'password');
    assertStringIncludes(html, '_csrf');
  });

  await t.step('successful login with correct credentials', async () => {
    await resetDb();

    const passwordHash = await hashPassword('admin123');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Get CSRF token from login page
    const loginPageReq = new Request('http://localhost/admin/login');
    const loginPageRes = await handler(loginPageReq);
    const loginHtml = await loginPageRes.text();

    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    assertExists(csrfMatch, 'CSRF token should be in login page');
    const csrfToken = csrfMatch[1]!;

    // Submit login
    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'admin123',
      _csrf: csrfToken,
    });

    const loginReq = new Request('http://localhost/admin/login', {
      method: 'POST',
      body: formData,
    });
    const loginRes = await handler(loginReq);

    assertEquals(loginRes.status, 302);
    assertEquals(loginRes.headers.get('Location'), '/admin');

    const setCookie = loginRes.headers.get('Set-Cookie');
    assertExists(setCookie, 'Set-Cookie header should be present');
    assertStringIncludes(setCookie, 'cms_token=');
    assertStringIncludes(setCookie, 'HttpOnly');
  });

  await t.step('rejects invalid password', async () => {
    await resetDb();

    const passwordHash = await hashPassword('correct-password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Get CSRF token
    const loginPageRes = await handler(
      new Request('http://localhost/admin/login'),
    );
    const loginHtml = await loginPageRes.text();
    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch![1]!;

    // Submit with wrong password
    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'wrong-password',
      _csrf: csrfToken,
    });

    const loginReq = new Request('http://localhost/admin/login', {
      method: 'POST',
      body: formData,
    });
    const loginRes = await handler(loginReq);

    assertEquals(loginRes.status, 401);
    const html = await loginRes.text();
    assertStringIncludes(html, 'Invalid email or password');
  });

  await t.step('allows access with valid token', async () => {
    await resetDb();

    const passwordHash = await hashPassword('admin123');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Login to get token
    const loginPageRes = await handler(
      new Request('http://localhost/admin/login'),
    );
    const loginHtml = await loginPageRes.text();
    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch![1]!;

    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'admin123',
      _csrf: csrfToken,
    });

    const loginRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: formData,
      }),
    );

    // Extract token from Set-Cookie
    const setCookie = loginRes.headers.get('Set-Cookie')!;
    const tokenMatch = setCookie.match(/cms_token=([^;]+)/);
    assertExists(tokenMatch, 'Token should be in Set-Cookie');
    const token = tokenMatch[1];

    // Access dashboard with token
    const dashboardReq = new Request('http://localhost/admin', {
      headers: { 'Cookie': `cms_token=${token}` },
    });
    const dashboardRes = await handler(dashboardReq);

    assertEquals(dashboardRes.status, 200);
    const html = await dashboardRes.text();
    assertStringIncludes(html, 'users');
  });

  // Cleanup
  await client.close();
});

// ============================================================================
// Policy filtering integration tests (shared PGlite instance)
// ============================================================================

Deno.test('integration: policy tests', async (t) => {
  // Create single PGlite instance for all policy tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  // Create tables once
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users RESTART IDENTITY CASCADE`,
    );
  }

  await t.step('filters list to only owned records', async () => {
    await resetDb();

    // Create two users
    await db.insert(users).values([
      { email: 'alice@example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob' },
    ]);

    // Create posts: 2 by Alice (id=1), 1 by Bob (id=2)
    await db.insert(posts).values([
      { title: 'Alice Post 1', body: 'Content 1', authorId: 1 },
      { title: 'Alice Post 2', body: 'Content 2', authorId: 1 },
      { title: 'Bob Post 1', body: 'Content 3', authorId: 2 },
    ]);

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        posts: ownedBy(posts, 'authorId'),
      },
    });

    // Create JWT for "user 1" (Alice's posts have authorId=1)
    const alicePayload = createJwtPayload('1');
    const aliceToken = await signJwt(alicePayload, AUTH_SECRET);

    const request = new Request('http://localhost/admin/posts', {
      headers: { Cookie: `cms_token=${aliceToken}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();

    assertStringIncludes(html, 'Alice Post 1');
    assertStringIncludes(html, 'Alice Post 2');
    assertEquals(
      html.includes('Bob Post 1'),
      false,
      "Should not see Bob's post",
    );
  });

  await t.step('admin bypasses ownership policy', async () => {
    await resetDb();

    // Create users for posts
    await db.insert(users).values([
      { email: 'user1@example.com', name: 'User1' },
      { email: 'user2@example.com', name: 'User2' },
    ]);

    // Create posts by user 2
    await db.insert(posts).values([
      { title: 'User Post 1', body: 'Content', authorId: 2 },
      { title: 'User Post 2', body: 'Content', authorId: 2 },
    ]);

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        posts: adminOr(ownedBy(posts, 'authorId')),
      },
    });

    // Create JWT for admin with admin role
    const adminPayload = createJwtPayload('1', 'admin');
    const adminToken = await signJwt(adminPayload, AUTH_SECRET);

    const request = new Request('http://localhost/admin/posts', {
      headers: { Cookie: `cms_token=${adminToken}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();

    assertStringIncludes(html, 'User Post 1');
    assertStringIncludes(html, 'User Post 2');
  });

  await t.step('returns 403 for unauthorized record access', async () => {
    await resetDb();

    // Create two users
    await db.insert(users).values([
      { email: 'alice@example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob' },
    ]);

    // Create post by Bob (authorId=2)
    await db.insert(posts).values([
      { title: 'Bob Secret Post', body: 'Private', authorId: 2 },
    ]);

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        posts: ownedBy(posts, 'authorId'),
      },
    });

    // Create JWT for "user 1" (Alice)
    const alicePayload = createJwtPayload('1');
    const aliceToken = await signJwt(alicePayload, AUTH_SECRET);

    // Alice tries to view Bob's post
    const request = new Request('http://localhost/admin/posts/1', {
      headers: { Cookie: `cms_token=${aliceToken}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 303);
    const location = response.headers.get('Location');
    assertStringIncludes(location ?? '', '_flash=read_forbidden');
  });

  await t.step('atomic update prevents race conditions', async () => {
    await resetDb();

    // Create two users
    await db.insert(users).values([
      { email: 'alice@example.com', name: 'Alice' },
      { email: 'bob@example.com', name: 'Bob' },
    ]);

    // Create Alice's post (authorId=1)
    await db.insert(posts).values([
      { title: 'Alice Post', body: 'Original', authorId: 1 },
    ]);

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        posts: ownedBy(posts, 'authorId'),
      },
    });

    // Create JWT for "user 2" (Bob)
    const bobPayload = createJwtPayload('2');
    const bobToken = await signJwt(bobPayload, AUTH_SECRET);
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

    // Bob tries to update Alice's post
    const formData = createFormData({
      title: 'Hacked by Bob',
      body: 'Malicious content',
      authorId: '1',
      _csrf: csrfToken,
    });

    const request = new Request('http://localhost/admin/posts/1/edit', {
      method: 'POST',
      headers: { Cookie: `cms_token=${bobToken}` },
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 303);
    const location = response.headers.get('Location');
    assertStringIncludes(location ?? '', '_flash=update_forbidden');

    // Verify post was NOT modified
    const [post] = await db.select().from(posts).where(sql`id = 1`);
    assertEquals(post?.title, 'Alice Post');
    assertEquals(post?.body, 'Original');
  });

  // Cleanup
  await client.close();
});

// ============================================================================
// Column Policy Integration Tests
// ============================================================================

Deno.test('integration: column policy tests', async (t) => {
  // Create single PGlite instance for column policy tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users RESTART IDENTITY CASCADE`,
    );
  }

  await t.step('read: false hides column from list view', async () => {
    await resetDb();

    // Create test data
    await db.insert(users).values([
      { email: 'secret@example.com', name: 'Secret User', bio: 'Public bio' },
      { email: 'another@example.com', name: 'Another User' },
    ]);

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        users: {
          columns: {
            email: { read: () => false }, // Hide email from all users
          },
        },
      },
    });

    // Create JWT
    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request('http://localhost/admin/users', {
      headers: { Cookie: `cms_token=${token}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();

    // Name should be visible
    assertStringIncludes(html, 'Secret User');
    assertStringIncludes(html, 'Another User');

    // Email should NOT be visible (hidden by column policy)
    assertEquals(
      html.includes('secret@example.com'),
      false,
      'Email should be hidden from list view',
    );
    assertEquals(
      html.includes('another@example.com'),
      false,
      'Email should be hidden from list view',
    );
  });

  await t.step('read: false hides column from detail view', async () => {
    await resetDb();

    // Create test data
    await db.insert(users).values({
      email: 'private@example.com',
      name: 'Private User',
      bio: 'This bio is public',
    });

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        users: {
          columns: {
            email: { read: () => false },
          },
        },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request('http://localhost/admin/users/1', {
      headers: { Cookie: `cms_token=${token}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();

    // Name and bio should be visible
    assertStringIncludes(html, 'Private User');
    assertStringIncludes(html, 'This bio is public');

    // Email should NOT be visible
    assertEquals(
      html.includes('private@example.com'),
      false,
      'Email should be hidden from detail view',
    );
  });

  await t.step('read: false hides column from edit form', async () => {
    await resetDb();

    // Create test data
    await db.insert(users).values({
      email: 'hidden@example.com',
      name: 'Editable User',
    });

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        users: {
          columns: {
            email: { read: () => false },
          },
        },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request('http://localhost/admin/users/1/edit', {
      headers: { Cookie: `cms_token=${token}` },
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();

    // Name should have an input field
    assertStringIncludes(html, 'Editable User');

    // Email should NOT be visible (no input, no value)
    assertEquals(
      html.includes('hidden@example.com'),
      false,
      'Email value should be hidden from edit form',
    );
    // Check that the email input field is not rendered
    assertEquals(
      html.includes('name="email"'),
      false,
      'Email input field should not exist in edit form',
    );
  });

  await t.step('role-based column visibility works', async () => {
    await resetDb();

    // Create test data
    await db.insert(users).values({
      email: 'user@example.com',
      name: 'Test User',
    });

    // Create admin user with role
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });
    await db.insert(adminUsers).values({
      email: 'editor@example.com',
      passwordHash,
      role: 'editor',
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        users: {
          columns: {
            // Only admins can see email
            email: { read: (ctx) => ctx.user?.role === 'admin' },
          },
        },
      },
    });

    // Admin can see email
    const adminPayload = createJwtPayload('1', 'admin');
    const adminToken = await signJwt(adminPayload, AUTH_SECRET);

    const adminRequest = new Request('http://localhost/admin/users/1', {
      headers: { Cookie: `cms_token=${adminToken}` },
    });
    const adminResponse = await handler(adminRequest);
    const adminHtml = await adminResponse.text();

    assertEquals(adminResponse.status, 200);
    assertStringIncludes(
      adminHtml,
      'user@example.com',
      'Admin should see email',
    );

    // Editor cannot see email
    const editorPayload = createJwtPayload('2', 'editor');
    const editorToken = await signJwt(editorPayload, AUTH_SECRET);

    const editorRequest = new Request('http://localhost/admin/users/1', {
      headers: { Cookie: `cms_token=${editorToken}` },
    });
    const editorResponse = await handler(editorRequest);
    const editorHtml = await editorResponse.text();

    assertEquals(editorResponse.status, 200);
    assertStringIncludes(editorHtml, 'Test User', 'Editor should see name');
    assertEquals(
      editorHtml.includes('user@example.com'),
      false,
      'Editor should NOT see email',
    );
  });

  await t.step('write: false ignores posted data for that column', async () => {
    await resetDb();

    // Create test user
    await db.insert(users).values({
      email: 'original@example.com',
      name: 'Original Name',
    });

    // Create admin user for auth
    const passwordHash = await hashPassword('password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({ db, usersTable: adminUsers }),
      },
      policies: {
        users: {
          columns: {
            // Email is read-only (can see but not edit)
            email: { write: () => false },
          },
        },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

    // Try to update with new email (should be ignored)
    const formData = createFormData({
      name: 'Updated Name',
      email: 'hacked@example.com', // This should be ignored!
      _csrf: csrfToken,
    });

    const request = new Request('http://localhost/admin/users/1/edit', {
      method: 'POST',
      headers: { Cookie: `cms_token=${token}` },
      body: formData,
    });
    const response = await handler(request);

    // Should redirect on success
    assertEquals(response.status, 303);

    // Verify: name was updated, but email was NOT changed
    const [user] = await db.select().from(users).where(sql`id = 1`);
    assertEquals(user?.name, 'Updated Name');
    assertEquals(
      user?.email,
      'original@example.com',
      'Email should NOT be changed when write: false',
    );
  });

  await t.step(
    'write: false on required column during create needs default',
    async () => {
      await resetDb();

      // Create admin user for auth
      const passwordHash = await hashPassword('password');
      await db.insert(adminUsers).values({
        email: 'admin@example.com',
        passwordHash,
      });

      // Handler where email is hidden from writing but has no default
      // This should show an error when trying to create (email is required)
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
        },
        policies: {
          users: {
            columns: {
              // Email is hidden from writing with NO default
              email: { write: () => false },
            },
          },
        },
      });

      const payload = createJwtPayload('1');
      const token = await signJwt(payload, AUTH_SECRET);

      // Just GET the create form - it should show a configuration error
      const request = new Request('http://localhost/admin/users/new', {
        headers: { Cookie: `cms_token=${token}` },
      });
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();

      // Should show configuration error about missing default
      assertStringIncludes(
        html,
        'Configuration error',
        'Should show config error for hidden required column without default',
      );
      assertStringIncludes(
        html,
        'email',
        'Error should mention the problematic column',
      );
    },
  );

  await t.step(
    'write: false with default injects value on create',
    async () => {
      await resetDb();

      // Create admin user for auth
      const passwordHash = await hashPassword('password');
      await db.insert(adminUsers).values({
        email: 'admin@example.com',
        passwordHash,
      });

      // Handler where email is hidden but has a default
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
        },
        policies: {
          users: {
            columns: {
              email: {
                write: () => false,
                default: () => 'auto-generated@example.com',
              },
            },
          },
        },
      });

      const payload = createJwtPayload('1');
      const token = await signJwt(payload, AUTH_SECRET);
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

      // Create user without email (it should be auto-filled)
      const formData = createFormData({
        name: 'New User',
        _csrf: csrfToken,
      });

      const request = new Request('http://localhost/admin/users/new', {
        method: 'POST',
        headers: { Cookie: `cms_token=${token}` },
        body: formData,
      });
      const response = await handler(request);

      // Should redirect on success
      assertEquals(response.status, 303);

      // Verify: email was auto-filled with the default
      const [user] = await db.select().from(users).where(sql`id = 1`);
      assertEquals(user?.name, 'New User');
      assertEquals(
        user?.email,
        'auto-generated@example.com',
        'Email should be auto-filled from policy default',
      );
    },
  );

  // Cleanup
  await client.close();
});

// ============================================================================
// Secure by Default Tests - auth enabled but policies undefined
// ============================================================================

Deno.test('integration: secure by default tests', async (t) => {
  // Create single PGlite instance for all secure-by-default tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  // Create tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);

  // Insert test data
  await db.insert(users).values({ email: 'alice@test.com', name: 'Alice' });
  await db.insert(posts).values({
    title: 'Test Post',
    body: 'Content',
    authorId: 1,
  });

  // Create admin user for auth
  const passwordHash = await hashPassword('admin123');
  await db.insert(adminUsers).values({
    email: 'admin@test.com',
    passwordHash,
    role: 'admin',
  });

  await t.step(
    'denies access when auth enabled but policies undefined (safeguard test)',
    async () => {
      // This tests the runtime safeguard in crud.ts that denies access
      // when auth is enabled but policies are undefined.
      // This scenario shouldn't happen with proper Zod validation,
      // but the safeguard protects against bugs or bypasses.

      // Import the handleList function directly to test with crafted options
      const { handleList } = await import('../crud.ts');
      const { introspectFullSchema } = await import('@drizzle-cms/core');

      const introspected = introspectFullSchema(schemaWithAuth);
      const usersTable = introspected.tables.find((t) => t.name === 'users')!;

      // Craft options with auth enabled but policies undefined
      const craftedOptions = {
        introspected,
        db,
        basePath: '/admin',
        title: 'Test CMS',
        csrfSecret: TEST_CSRF_SECRET,
        isAuthenticated: () => true,
        canAccess: () => true,
        parsers: {},
        policies: undefined, // This is what we're testing!
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
          maxAge: 3600,
          cookieName: 'cms_token',
          loginTitle: 'Login',
          identityLabel: 'Email',
        },
      };

      const request = new Request('http://localhost/admin/users');
      const ctx = {
        request,
        url: new URL(request.url),
        // @ts-ignore - intentionally testing with undefined policies
        options: craftedOptions,
        route: { type: 'list', table: usersTable },
        authUser: undefined,
      };

      // @ts-ignore - RouteContext type mismatch is expected for this safeguard test
      const response = await handleList(ctx);

      // Should redirect with forbidden flash message
      assertEquals(response.status, 303);
      const location = response.headers.get('Location');
      assertStringIncludes(location ?? '', '_flash=list_forbidden');
    },
  );

  await t.step(
    'allows access with policies: dangerously-open (explicit opt-in)',
    async () => {
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: 'dangerously-open',
      });

      const request = new Request('http://localhost/admin/users');
      const response = await handler(request);

      // Should allow access - no auth required
      assertEquals(response.status, 200);
      const text = await response.text();
      assertStringIncludes(text, 'Alice');
    },
  );

  await t.step(
    'allows CRUD operations with dangerously-open auth',
    async () => {
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: 'dangerously-open',
      });

      // Test list
      const listReq = new Request('http://localhost/admin/posts');
      const listRes = await handler(listReq);
      assertEquals(listRes.status, 200);

      // Test read
      const readReq = new Request('http://localhost/admin/posts/1');
      const readRes = await handler(readReq);
      assertEquals(readRes.status, 200);

      // Test create form
      const createReq = new Request('http://localhost/admin/posts/new');
      const createRes = await handler(createReq);
      assertEquals(createRes.status, 200);

      // Test edit form
      const editReq = new Request('http://localhost/admin/posts/1/edit');
      const editRes = await handler(editReq);
      assertEquals(editRes.status, 200);
    },
  );

  // Cleanup
  await client.close();
});

// ============================================================================
// Plugin Integration Tests
// ============================================================================

Deno.test('integration: plugin afterRead transform', async (t) => {
  // Create fresh PGlite instance for plugin tests
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Helper to reset tables
  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`);
  }

  // Track which hooks were called
  const hookCalls: string[] = [];

  // In-process plugin with afterRead transform
  const testPlugin = {
    name: 'test-afterread',
    filter: () => true,
    hooks: {
      transform: {
        afterRead: (_ctx: unknown, data: Record<string, unknown>) => {
          hookCalls.push('afterRead');
          // Mark the data as transformed
          return { ...data, _transformed: true };
        },
      },
    },
  };

  await t.step('afterRead runs on list view', async () => {
    await resetDb();
    hookCalls.length = 0;

    await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
      plugins: [testPlugin],
    });

    const request = new Request('http://localhost/admin/users');
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(hookCalls.includes('afterRead'), true);
  });

  await t.step('afterRead runs on read/view page', async () => {
    await resetDb();
    hookCalls.length = 0;

    await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
      plugins: [testPlugin],
    });

    const request = new Request('http://localhost/admin/users/1');
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(hookCalls.includes('afterRead'), true);
  });

  await t.step('afterRead runs on edit page (GET)', async () => {
    await resetDb();
    hookCalls.length = 0;

    await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
    });

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
      plugins: [testPlugin],
    });

    const request = new Request('http://localhost/admin/users/1/edit');
    const response = await handler(request);

    assertEquals(response.status, 200);
    // This is the bug we fixed - afterRead should run on edit page too
    assertEquals(
      hookCalls.includes('afterRead'),
      true,
      'afterRead should be called on edit page',
    );
  });

  // Cleanup
  await client.close();
});
