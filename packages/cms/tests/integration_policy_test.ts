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
  generateSourceToken,
  posts,
  schemaWithAuth,
  SOURCE,
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
import { hashPassword, PasswordProvider } from '@hotsauce/auth';

// ─────────────────────────────────────────────────────────────
// Pre-computed password hashes (PBKDF2 is ~130ms per hash)
// ─────────────────────────────────────────────────────────────
const PRECOMPUTED_HASHES: Record<string, string> = {};

// Compute hashes once at module load (parallel)
const hashInit = Promise.all([
  hashPassword('password').then((h) => (PRECOMPUTED_HASHES['password'] = h)),
  hashPassword('admin123').then((h) => (PRECOMPUTED_HASHES['admin123'] = h)),
]);

/** Get pre-computed hash (or compute if not cached) */
async function getHash(password: string): Promise<string> {
  await hashInit;
  return PRECOMPUTED_HASHES[password] ?? await hashPassword(password);
}

// ============================================================================
// Row Policy Tests
// ============================================================================

Deno.test({
  name: 'integration: row policy tests',
  sanitizeOps: false, // Pre-computed hashes may complete during test
  fn: async (t) => {
    await hashInit;

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
      const passwordHash = await getHash('password');
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
      const passwordHash = await getHash('password');
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
      const adminPayload = createJwtPayload('1', undefined, 'admin');
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
      const passwordHash = await getHash('password');
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
      const passwordHash = await getHash('password');
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
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Bob tries to update Alice's post
      const formData = createFormData({
        title: 'Hacked by Bob',
        body: 'Malicious content',
        authorId: '1',
        _csrf: csrfToken,
        _source: sourceToken,
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
  },
});

// ============================================================================
// Column Policy Tests
// ============================================================================

Deno.test({
  name: 'integration: column policy tests',
  sanitizeOps: false,
  fn: async (t) => {
    await hashInit;

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
      const passwordHash = await getHash('password');
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
      const passwordHash = await getHash('password');
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
      const passwordHash = await getHash('password');
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
      const passwordHash = await getHash('password');
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
      const adminPayload = createJwtPayload('1', undefined, 'admin');
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
      const editorPayload = createJwtPayload('2', undefined, 'editor');
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

    await t.step(
      'write: false ignores posted data for that column',
      async () => {
        await resetDb();

        // Create test user
        await db.insert(users).values({
          email: 'original@example.com',
          name: 'Original Name',
        });

        // Create admin user for auth
        const passwordHash = await getHash('password');
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
        const sourceToken = await generateSourceToken(
          SOURCE.CMS,
          TEST_CSRF_SECRET,
        );

        // Try to update with new email (should be ignored)
        const formData = createFormData({
          name: 'Updated Name',
          email: 'hacked@example.com', // This should be ignored!
          _csrf: csrfToken,
          _source: sourceToken,
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
      },
    );

    await t.step(
      'write: false on required column during create needs default',
      async () => {
        await resetDb();

        // Create admin user for auth
        const passwordHash = await getHash('password');
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
        const passwordHash = await getHash('password');
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
        const sourceToken = await generateSourceToken(
          SOURCE.CMS,
          TEST_CSRF_SECRET,
        );

        // Create user without email (it should be auto-filled)
        const formData = createFormData({
          name: 'New User',
          _csrf: csrfToken,
          _source: sourceToken,
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
  },
});

// ============================================================================
// Secure by Default Tests
// ============================================================================

Deno.test({
  name: 'integration: secure by default tests',
  sanitizeOps: false,
  fn: async (t) => {
    await hashInit;

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
    const passwordHash = await getHash('admin123');
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
        const { introspectFullSchema } = await import('@hotsauce/core');

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
          policies: 'dangerously-open',
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
          policies: 'dangerously-open',
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
  },
});

// ============================================================================
// policiesFromSchema Integration Tests
// ============================================================================

import { policiesFromSchema } from '../policies/from-schema.ts';
import {
  createPagesTable,
  pages,
  pluginSource,
  schemaWithPlugins,
} from './integration_helpers.ts';

Deno.test({
  name: 'integration: policiesFromSchema with plugin-configured columns',
  sanitizeOps: false,
  fn: async (t) => {
    const client = new PGlite();
    const db = drizzle(client, { schema: schemaWithPlugins });

    await createPagesTable(db);

    async function resetDb() {
      await db.execute(sql`TRUNCATE TABLE pages RESTART IDENTITY CASCADE`);
    }

    await t.step(
      'puck plugin source can write to plugin-configured column',
      async () => {
        await resetDb();

        // Create a page first
        await db.insert(pages).values({
          title: 'Test Page',
          content: { blocks: [] },
        });

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Generate a plugin source token
        const puckSourceToken = await generateSourceToken(
          pluginSource('puck'),
          TEST_CSRF_SECRET,
        );
        const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

        // Update with puck plugin source - should succeed
        const formData = createFormData({
          _csrf: csrfToken,
          _source: puckSourceToken,
          _method: 'PATCH',
          title: 'Updated Page',
          content: JSON.stringify({
            blocks: [{ type: 'heading', text: 'Hello' }],
          }),
        });

        const updateReq = new Request('http://localhost/admin/pages/1', {
          method: 'POST',
          body: formData,
        });

        const updateRes = await handler(updateReq);

        // Should redirect to detail page on success
        assertEquals(updateRes.status, 303);
        const location = updateRes.headers.get('Location');
        assertStringIncludes(location ?? '', '/admin/pages/1');
        assertEquals(location?.includes('_flash=update_error'), false);

        // Verify the content was actually updated
        const [updated] = await db.select().from(pages).where(sql`id = 1`);
        assertEquals(updated?.title, 'Updated Page');
        // deno-lint-ignore no-explicit-any
        assertEquals((updated?.content as any)?.blocks?.[0]?.type, 'heading');
      },
    );

    await t.step(
      'puck client: sending ONLY content column with plugin source',
      async () => {
        await resetDb();

        // Create a page first with existing content
        await db.insert(pages).values({
          title: 'My Page Title',
          content: { content: [], root: { props: {} } },
        });

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Generate tokens exactly like Puck client
        const puckSourceToken = await generateSourceToken(
          pluginSource('puck'),
          TEST_CSRF_SECRET,
        );
        const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

        // Send ONLY content field - exactly what Puck client does
        // Note: NO _method, NO title, only content
        const formData = createFormData({
          _csrf: csrfToken,
          _source: puckSourceToken,
          content: JSON.stringify({
            content: [{
              type: 'HeadingBlock',
              props: { id: 'test-id', children: 'Hello World' },
            }],
            root: { props: {} },
          }),
        });

        const updateReq = new Request('http://localhost/admin/pages/1', {
          method: 'POST',
          body: formData,
        });

        const updateRes = await handler(updateReq);

        // Should succeed (redirect or 2xx)
        assertEquals(updateRes.status, 303, 'Should redirect on success');
        const location = updateRes.headers.get('Location');
        assertStringIncludes(location ?? '', '/admin/pages/1');
        assertEquals(
          location?.includes('_flash=update_error'),
          false,
          'Should not have error flash',
        );

        // Verify ONLY content was updated, title preserved
        const [updated] = await db.select().from(pages).where(sql`id = 1`);
        assertEquals(
          updated?.title,
          'My Page Title',
          'Title should be unchanged',
        );
        // deno-lint-ignore no-explicit-any
        const updatedBlockType = (updated?.content as any)?.content?.[0]?.type;
        assertEquals(
          updatedBlockType,
          'HeadingBlock',
          'Content should be updated',
        );
      },
    );

    await t.step(
      'cms source cannot write to plugin-configured column',
      async () => {
        await resetDb();

        // Create a page first
        await db.insert(pages).values({
          title: 'Original Title',
          content: { blocks: [] },
        });

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Generate a CMS source token (not plugin)
        const cmsSourceToken = await generateSourceToken(
          'cms',
          TEST_CSRF_SECRET,
        );
        const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

        // Update with CMS source - content should NOT be writable
        const formData = createFormData({
          _csrf: csrfToken,
          _source: cmsSourceToken,
          _method: 'PATCH',
          title: 'CMS Updated Title',
          content: JSON.stringify({ blocks: [{ type: 'should-not-save' }] }),
        });

        const updateReq = new Request('http://localhost/admin/pages/1', {
          method: 'POST',
          body: formData,
        });

        const updateRes = await handler(updateReq);

        // Should still redirect (title update succeeds)
        assertEquals(updateRes.status, 303);

        // Verify title was updated but content was NOT (column not writable for cms source)
        const [updated] = await db.select().from(pages).where(sql`id = 1`);
        assertEquals(updated?.title, 'CMS Updated Title');
        // Content should still be the original value
        // deno-lint-ignore no-explicit-any
        assertEquals((updated?.content as any)?.blocks?.length, 0);
      },
    );

    await t.step(
      'create: plugin source can set plugin-protected column',
      async () => {
        await resetDb();

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Generate a plugin source token
        const puckSourceToken = await generateSourceToken(
          pluginSource('puck'),
          TEST_CSRF_SECRET,
        );
        const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

        // Create with puck plugin source - should include content
        const formData = createFormData({
          _csrf: csrfToken,
          _source: puckSourceToken,
          title: 'New Page via Puck',
          content: JSON.stringify({
            content: [{
              type: 'HeadingBlock',
              props: { id: 'new-id', children: 'Created by Puck' },
            }],
            root: { props: {} },
          }),
        });

        const createReq = new Request('http://localhost/admin/pages/new', {
          method: 'POST',
          body: formData,
        });

        const createRes = await handler(createReq);

        // Should redirect on success
        assertEquals(createRes.status, 303);
        const location = createRes.headers.get('Location');
        assertStringIncludes(location ?? '', '/admin/pages/');

        // Verify both title and content were saved
        const [created] = await db.select().from(pages).where(sql`id = 1`);
        assertEquals(created?.title, 'New Page via Puck');
        // deno-lint-ignore no-explicit-any
        const createdBlockType = (created?.content as any)?.content?.[0]?.type;
        assertEquals(
          createdBlockType,
          'HeadingBlock',
        );
      },
    );

    await t.step(
      'create: cms source cannot set plugin-protected column',
      async () => {
        await resetDb();

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Generate a CMS source token (not plugin)
        const cmsSourceToken = await generateSourceToken(
          'cms',
          TEST_CSRF_SECRET,
        );
        const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

        // Create with CMS source - content should be ignored
        const formData = createFormData({
          _csrf: csrfToken,
          _source: cmsSourceToken,
          title: 'New Page via CMS',
          content: JSON.stringify({ blocks: [{ type: 'should-not-save' }] }),
        });

        const createReq = new Request('http://localhost/admin/pages/new', {
          method: 'POST',
          body: formData,
        });

        const createRes = await handler(createReq);

        // Should redirect on success (title is valid)
        assertEquals(createRes.status, 303);

        // Verify title was saved but content was NOT (column not writable for cms source)
        const [created] = await db.select().from(pages).where(sql`id = 1`);
        assertEquals(created?.title, 'New Page via CMS');
        // Content should be null (not saved)
        assertEquals(created?.content, null);
      },
    );

    await t.step(
      'content field not shown in edit form for cms source',
      async () => {
        await resetDb();

        // Create a page
        await db.insert(pages).values({
          title: 'Test Page',
          content: { blocks: [{ type: 'text' }] },
        });

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithPlugins,
          basePath: '/admin',
          auth: 'dangerously-open',
          policies: policiesFromSchema(schemaWithPlugins),
        });

        // Get the edit form (uses cms source)
        const editReq = new Request('http://localhost/admin/pages/1/edit');
        const editRes = await handler(editReq);

        assertEquals(editRes.status, 200);
        const html = await editRes.text();

        // Title field should be present
        assertStringIncludes(html, 'name="title"');

        // Content field should NOT be present (not writable for cms source)
        assertEquals(
          html.includes('name="content"'),
          false,
          'Content field should not be in the edit form for CMS source',
        );
      },
    );

    await client.close();
  },
});

// ============================================================================
// Source Token Enforcement Tests (Handler Level)
// ============================================================================

Deno.test({
  name: 'integration: handler blocks writes without source token',
  sanitizeOps: false,
  fn: async (t) => {
    const client = new PGlite();
    const db = drizzle(client, { schema: schemaWithAuth });

    await createBasicTables(db);

    async function resetDb() {
      await db.execute(
        sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`,
      );
    }

    await t.step('create blocked when _source missing', async () => {
      await resetDb();

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: 'dangerously-open',
        policies: {},
      });

      // Generate valid CSRF but no _source
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

      // Simulate form submission without _source field
      const formData = createFormData({
        _csrf: csrfToken,
        // NO _source field - this should be blocked
        title: 'Test Post',
        body: 'Some content',
      });

      const req = new Request('http://localhost/admin/posts/new', {
        method: 'POST',
        body: formData,
      });

      const res = await handler(req);

      // Should return 200 with form errors (not redirect)
      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, 'Invalid or missing source token');

      // Verify nothing was created
      const allPosts = await db.select().from(posts);
      assertEquals(allPosts.length, 0);
    });

    await t.step('update blocked when _source missing', async () => {
      await resetDb();

      // Create a user and post first
      await db.insert(users).values({
        name: 'Test User',
        email: 'test@example.com',
      });
      await db.insert(posts).values({
        title: 'Original Title',
        body: 'Original body',
        authorId: 1,
      });

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: 'dangerously-open',
        policies: {},
      });

      // Generate valid CSRF but no _source
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

      // Simulate form submission without _source field
      const formData = createFormData({
        _csrf: csrfToken,
        _method: 'PUT',
        // NO _source field - this should be blocked
        title: 'Modified Title',
        body: 'Modified body',
      });

      const req = new Request('http://localhost/admin/posts/1', {
        method: 'POST',
        body: formData,
      });

      const res = await handler(req);

      // Should return 200 with form errors (not redirect)
      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, 'Invalid or missing source token');

      // Verify nothing was modified
      const [post] = await db.select().from(posts);
      assertEquals(post?.title, 'Original Title');
      assertEquals(post?.body, 'Original body');
    });

    await t.step('create blocked when _source is invalid', async () => {
      await resetDb();

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: 'dangerously-open',
        policies: {},
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);

      // Submit with invalid/tampered _source
      const formData = createFormData({
        _csrf: csrfToken,
        _source: 'cms.abc123.tampered_signature',
        title: 'Test Post',
        body: 'Some content',
      });

      const req = new Request('http://localhost/admin/posts/new', {
        method: 'POST',
        body: formData,
      });

      const res = await handler(req);

      // Should return 200 with form errors (not redirect)
      assertEquals(res.status, 200);
      const html = await res.text();
      assertStringIncludes(html, 'Invalid or missing source token');

      // Verify nothing was created
      const allPosts = await db.select().from(posts);
      assertEquals(allPosts.length, 0);
    });

    await client.close();
  },
});
