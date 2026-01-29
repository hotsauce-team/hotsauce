// Policy Integration Tests
// Tests row and column policies with real database

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  adminUsers,
  AUTH_SECRET,
  createAdminUsersTable,
  createBasicTables,
  createFormData,
  posts,
  schemaWithAuth,
  TEST_CSRF_SECRET,
  users,
} from './integration_helpers.ts';
import {
  adminOr,
  createCmsHandler,
  createJwtPayload,
  ownedBy,
  signJwt,
} from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import { hashPassword, PasswordProvider } from '../auth/mod.ts';

// ============================================================================
// Row Policy Tests
// ============================================================================

Deno.test('integration: row policy tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  await createBasicTables(db);
  await createAdminUsersTable(db);

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

  await client.close();
});

// ============================================================================
// Column Policy Tests
// ============================================================================

Deno.test('integration: column policy tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  await createBasicTables(db);
  await createAdminUsersTable(db);

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

  await client.close();
});

// ============================================================================
// Secure by Default Tests
// ============================================================================

Deno.test('integration: secure by default tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  await createBasicTables(db);
  await createAdminUsersTable(db);

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

  await client.close();
});
