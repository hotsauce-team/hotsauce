// Integration tests for handlers with real database
// Tests the full handler → DB flow using PGlite

import { assertEquals, assertExists, assertStringIncludes } from 'jsr:@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { pgTable, serial, varchar, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createCmsHandler } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';

// Test CSRF secret (long enough to pass validation)
const TEST_CSRF_SECRET = 'test-csrf-secret-for-integration-tests-min-32-chars';

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

const schema = { users, posts, usersRelations, postsRelations };

// ============================================================================
// Test Helpers
// ============================================================================

async function createTestDb() {
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
  
  return { client, db };
}

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

// ============================================================================
// Integration Tests
// ============================================================================

Deno.test('integration: dashboard renders table list', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'Dashboard');
  assertStringIncludes(html, 'Users');
  assertStringIncludes(html, 'Posts');
  
  await client.close();
});

Deno.test('integration: list view shows empty table', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'Users');
  assertStringIncludes(html, 'No records found');
  
  await client.close();
});

Deno.test('integration: create form renders with CSRF token', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users/new');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'Create Users');
  assertStringIncludes(html, 'name="_csrf"');
  assertStringIncludes(html, 'name="email"');
  assertStringIncludes(html, 'name="name"');
  
  await client.close();
});

Deno.test('integration: create record via POST', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    csrfSecret: TEST_CSRF_SECRET,
  });
  
  // Create a user
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
  
  // Should redirect after successful create
  assertEquals(response.status, 303);
  assertStringIncludes(response.headers.get('Location') ?? '', '/admin/users/');
  
  // Verify record in database
  const users_result = await db.select().from(users);
  assertEquals(users_result.length, 1);
  assertEquals(users_result[0]?.email, 'test@example.com');
  assertEquals(users_result[0]?.name, 'Test User');
  
  await client.close();
});

Deno.test('integration: create fails without CSRF token', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  // Try to create without CSRF token
  const formData = createFormData({
    email: 'test@example.com',
    name: 'Test User',
  });
  
  const request = new Request('http://localhost/admin/users/new', {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(request);
  
  // Should re-render form with error (not redirect)
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'Invalid or expired form');
  
  // Verify no record created
  const users_result = await db.select().from(users);
  assertEquals(users_result.length, 0);
  
  await client.close();
});

Deno.test('integration: read view shows record', async () => {
  const { client, db } = await createTestDb();
  
  // Insert a test user directly
  await db.insert(users).values({
    email: 'view@example.com',
    name: 'View Test',
  });
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users/1');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'view@example.com');
  assertStringIncludes(html, 'View Test');
  assertStringIncludes(html, 'Edit');
  assertStringIncludes(html, 'Delete');
  
  await client.close();
});

Deno.test('integration: edit form shows current values', async () => {
  const { client, db } = await createTestDb();
  
  // Insert a test user
  await db.insert(users).values({
    email: 'edit@example.com',
    name: 'Edit Test',
    bio: 'Original bio',
  });
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users/1/edit');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'edit@example.com');
  assertStringIncludes(html, 'Edit Test');
  assertStringIncludes(html, 'Original bio');
  assertStringIncludes(html, 'name="_csrf"');
  
  await client.close();
});

Deno.test('integration: update record via POST', async () => {
  const { client, db } = await createTestDb();
  
  // Insert a test user
  await db.insert(users).values({
    email: 'update@example.com',
    name: 'Before Update',
  });
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    csrfSecret: TEST_CSRF_SECRET,
  });
  
  // Update the user
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
  
  // Should redirect after successful update
  assertEquals(response.status, 303);
  
  // Verify record updated
  const users_result = await db.select().from(users);
  assertEquals(users_result.length, 1);
  assertEquals(users_result[0]?.email, 'updated@example.com');
  assertEquals(users_result[0]?.name, 'After Update');
  assertEquals(users_result[0]?.bio, 'New bio');
  
  await client.close();
});

Deno.test('integration: delete record via POST', async () => {
  const { client, db } = await createTestDb();
  
  // Insert a test user
  await db.insert(users).values({
    email: 'delete@example.com',
    name: 'To Delete',
  });
  
  // Verify user exists
  let users_result = await db.select().from(users);
  assertEquals(users_result.length, 1);
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    csrfSecret: TEST_CSRF_SECRET,
  });
  
  // Delete the user
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  const formData = createFormData({
    _csrf: csrfToken,
  });
  
  const request = new Request('http://localhost/admin/users/1/delete', {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(request);
  
  // Should redirect with flash
  assertEquals(response.status, 303);
  assertStringIncludes(response.headers.get('Location') ?? '', '_flash=delete_success');
  
  // Verify record deleted
  users_result = await db.select().from(users);
  assertEquals(users_result.length, 0);
  
  await client.close();
});

Deno.test('integration: delete fails without CSRF token', async () => {
  const { client, db } = await createTestDb();
  
  // Insert a test user
  await db.insert(users).values({
    email: 'nodelete@example.com',
    name: 'Should Not Delete',
  });
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  // Try to delete without CSRF token
  const formData = createFormData({});
  
  const request = new Request('http://localhost/admin/users/1/delete', {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(request);
  
  // Should redirect with error flash
  assertEquals(response.status, 303);
  assertStringIncludes(response.headers.get('Location') ?? '', '_flash=delete_error');
  
  // Verify record NOT deleted
  const users_result = await db.select().from(users);
  assertEquals(users_result.length, 1);
  
  await client.close();
});

Deno.test('integration: list view shows records', async () => {
  const { client, db } = await createTestDb();
  
  // Insert test users
  await db.insert(users).values([
    { email: 'user1@example.com', name: 'User One' },
    { email: 'user2@example.com', name: 'User Two' },
    { email: 'user3@example.com', name: 'User Three' },
  ]);
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, 'user1@example.com');
  assertStringIncludes(html, 'User One');
  assertStringIncludes(html, 'user2@example.com');
  assertStringIncludes(html, 'user3@example.com');
  
  await client.close();
});

Deno.test('integration: foreign key relation in create form', async () => {
  const { client, db } = await createTestDb();
  
  // Insert users for FK selection
  await db.insert(users).values([
    { email: 'author1@example.com', name: 'Author One' },
    { email: 'author2@example.com', name: 'Author Two' },
  ]);
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  // Get the posts create form
  const request = new Request('http://localhost/admin/posts/new');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  const html = await response.text();
  // Should show author dropdown with user names
  assertStringIncludes(html, 'Author One');
  assertStringIncludes(html, 'Author Two');
  assertStringIncludes(html, 'authorId');
  
  await client.close();
});

Deno.test('integration: create post with foreign key', async () => {
  const { client, db } = await createTestDb();
  
  // Insert an author
  await db.insert(users).values({
    email: 'author@example.com',
    name: 'Post Author',
  });
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    csrfSecret: TEST_CSRF_SECRET,
  });
  
  // Create a post
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
  
  // Should redirect after successful create
  assertEquals(response.status, 303);
  
  // Verify post in database
  const posts_result = await db.select().from(posts);
  assertEquals(posts_result.length, 1);
  assertEquals(posts_result[0]?.title, 'Test Post');
  assertEquals(posts_result[0]?.authorId, 1);
  
  await client.close();
});

Deno.test('integration: 404 for non-existent record', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/users/999');
  const response = await handler(request);
  
  assertEquals(response.status, 404);
  
  await client.close();
});

Deno.test('integration: 404 for non-existent table', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin/nonexistent');
  const response = await handler(request);
  
  assertEquals(response.status, 404);
  
  await client.close();
});

Deno.test('integration: authentication check', async () => {
  const { client, db } = await createTestDb();
  
  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    isAuthenticated: () => false,
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  
  assertEquals(response.status, 403);
  
  await client.close();
});
