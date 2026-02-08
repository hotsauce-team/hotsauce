// Plugin Route Policy Integration Tests
// Tests that plugin routes correctly apply row and column policies

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  adminUsers,
  AUTH_SECRET,
  createAdminUsersTable,
  createBasicTables,
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
import { hashPassword, PasswordProvider } from '@hotsauce/auth';
import type { PluginRouteContext } from '@hotsauce/workers';

// ─────────────────────────────────────────────────────────────
// Pre-computed password hashes (PBKDF2 is ~130ms per hash)
// ─────────────────────────────────────────────────────────────
const PRECOMPUTED_HASHES: Record<string, string> = {};

const hashInit = Promise.all([
  hashPassword('password').then((h) => (PRECOMPUTED_HASHES['password'] = h)),
]);

async function getHash(password: string): Promise<string> {
  await hashInit;
  return PRECOMPUTED_HASHES[password] ?? await hashPassword(password);
}

// ============================================================================
// Plugin Route Policy Tests
// ============================================================================

Deno.test({
  name: 'integration: plugin route policy tests',
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

    await t.step('plugin route receives column-filtered record', async () => {
      await resetDb();

      // Create user for the post
      await db.insert(users).values({
        email: 'alice@example.com',
        name: 'Alice',
      });

      // Create post with all fields
      await db.insert(posts).values({
        title: 'Test Post',
        body: 'Public content',
        authorId: 1,
      });

      // Create admin user for auth
      const passwordHash = await getHash('password');
      await db.insert(adminUsers).values({
        email: 'admin@example.com',
        passwordHash,
      });

      let capturedRecord: Record<string, unknown> | undefined;

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
          policies: {
            posts: {
              columns: {
                // Hide body from all users
                body: { read: () => false },
              },
            },
          },
        },
        plugins: [
          {
            name: 'editor',
            hooks: {},
            filter: 'dangerously-open',
            routes: [
              {
                pattern: ':table/:id',
                handler: (ctx: PluginRouteContext) => {
                  capturedRecord = ctx.record;
                  return new Response(JSON.stringify(ctx.record), {
                    headers: { 'Content-Type': 'application/json' },
                  });
                },
              },
            ],
          },
        ],
      });

      // Create JWT for authenticated user
      const payload = createJwtPayload('1');
      const token = await signJwt(payload, AUTH_SECRET);

      const request = new Request('http://localhost/admin/editor/posts/1', {
        headers: { Cookie: `cms_token=${token}` },
      });
      const response = await handler(request);

      assertEquals(response.status, 200);

      // Record should NOT contain the hidden column
      assertEquals(capturedRecord?.id, 1);
      assertEquals(capturedRecord?.title, 'Test Post');
      assertEquals(capturedRecord?.body, undefined);
      assertEquals('body' in (capturedRecord ?? {}), false);
    });

    await t.step(
      'plugin route requesting hidden column returns 403',
      async () => {
        await resetDb();

        await db.insert(users).values({
          email: 'alice@example.com',
          name: 'Alice',
        });

        await db.insert(posts).values({
          title: 'Test Post',
          body: 'Secret content',
          authorId: 1,
        });

        const passwordHash = await getHash('password');
        await db.insert(adminUsers).values({
          email: 'admin@example.com',
          passwordHash,
        });

        let handlerCalled = false;

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithAuth,
          basePath: '/admin',
          auth: {
            secret: AUTH_SECRET,
            provider: new PasswordProvider({ db, usersTable: adminUsers }),
            policies: {
              posts: {
                columns: {
                  body: { read: () => false },
                },
              },
            },
          },
          plugins: [
            {
              name: 'editor',
              hooks: {},
              filter: 'dangerously-open',
              routes: [
                {
                  pattern: ':table/:id/:column',
                  handler: () => {
                    handlerCalled = true;
                    return new Response('OK');
                  },
                },
              ],
            },
          ],
        });

        const payload = createJwtPayload('1');
        const token = await signJwt(payload, AUTH_SECRET);

        // Request the hidden column directly
        const request = new Request(
          'http://localhost/admin/editor/posts/1/body',
          {
            headers: { Cookie: `cms_token=${token}` },
          },
        );
        const response = await handler(request);

        assertEquals(response.status, 403);
        assertEquals(handlerCalled, false);
        assertStringIncludes(await response.text(), 'Column not accessible');
      },
    );

    await t.step(
      'plugin route row policy filters inaccessible records',
      async () => {
        await resetDb();

        // Create two users
        await db.insert(users).values([
          { email: 'alice@example.com', name: 'Alice' },
          { email: 'bob@example.com', name: 'Bob' },
        ]);

        // Create post owned by Bob (user 2)
        await db.insert(posts).values({
          title: 'Bob Post',
          body: 'Content',
          authorId: 2,
        });

        const passwordHash = await getHash('password');
        await db.insert(adminUsers).values({
          email: 'admin@example.com',
          passwordHash,
        });

        let handlerCalled = false;

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithAuth,
          basePath: '/admin',
          auth: {
            secret: AUTH_SECRET,
            provider: new PasswordProvider({ db, usersTable: adminUsers }),
            policies: {
              // Only owner can access their posts
              posts: ownedBy(posts, 'authorId'),
            },
          },
          plugins: [
            {
              name: 'editor',
              hooks: {},
              filter: 'dangerously-open',
              routes: [
                {
                  pattern: ':table/:id',
                  handler: () => {
                    handlerCalled = true;
                    return new Response('OK');
                  },
                },
              ],
            },
          ],
        });

        // Alice (user 1) trying to access Bob's post (authorId=2)
        const alicePayload = createJwtPayload('1');
        const aliceToken = await signJwt(alicePayload, AUTH_SECRET);

        const request = new Request('http://localhost/admin/editor/posts/1', {
          headers: { Cookie: `cms_token=${aliceToken}` },
        });
        const response = await handler(request);

        // Row policy filtered out the record - should be 403
        assertEquals(response.status, 403);
        assertEquals(handlerCalled, false);
      },
    );

    await t.step('plugin route allows access to owned records', async () => {
      await resetDb();

      await db.insert(users).values({
        email: 'alice@example.com',
        name: 'Alice',
      });

      // Create post owned by Alice (user 1)
      await db.insert(posts).values({
        title: 'Alice Post',
        body: 'Content',
        authorId: 1,
      });

      const passwordHash = await getHash('password');
      await db.insert(adminUsers).values({
        email: 'admin@example.com',
        passwordHash,
      });

      let capturedRecord: Record<string, unknown> | undefined;

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
          policies: {
            posts: ownedBy(posts, 'authorId'),
          },
        },
        plugins: [
          {
            name: 'editor',
            hooks: {},
            filter: 'dangerously-open',
            routes: [
              {
                pattern: ':table/:id',
                handler: (ctx: PluginRouteContext) => {
                  capturedRecord = ctx.record;
                  return new Response('OK');
                },
              },
            ],
          },
        ],
      });

      // Alice (user 1) accessing her own post (authorId=1)
      const alicePayload = createJwtPayload('1');
      const aliceToken = await signJwt(alicePayload, AUTH_SECRET);

      const request = new Request('http://localhost/admin/editor/posts/1', {
        headers: { Cookie: `cms_token=${aliceToken}` },
      });
      const response = await handler(request);

      assertEquals(response.status, 200);
      assertEquals(capturedRecord?.title, 'Alice Post');
    });

    await t.step(
      'plugin route column value extraction respects policies',
      async () => {
        await resetDb();

        await db.insert(users).values({
          email: 'alice@example.com',
          name: 'Alice',
        });

        await db.insert(posts).values({
          title: 'Test Post',
          body: 'The actual body content',
          authorId: 1,
        });

        const passwordHash = await getHash('password');
        await db.insert(adminUsers).values({
          email: 'admin@example.com',
          passwordHash,
        });

        let capturedValue: unknown;
        let capturedField: unknown;

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithAuth,
          basePath: '/admin',
          auth: {
            secret: AUTH_SECRET,
            provider: new PasswordProvider({ db, usersTable: adminUsers }),
            policies: {
              // No column restrictions on title
              posts: {},
            },
          },
          plugins: [
            {
              name: 'editor',
              hooks: {},
              filter: 'dangerously-open',
              routes: [
                {
                  pattern: ':table/:id/:column',
                  handler: (ctx: PluginRouteContext) => {
                    capturedValue = ctx.value;
                    capturedField = ctx.field;
                    return new Response('OK');
                  },
                },
              ],
            },
          ],
        });

        const payload = createJwtPayload('1');
        const token = await signJwt(payload, AUTH_SECRET);

        // Request an accessible column
        const request = new Request(
          'http://localhost/admin/editor/posts/1/title',
          {
            headers: { Cookie: `cms_token=${token}` },
          },
        );
        const response = await handler(request);

        assertEquals(response.status, 200);
        assertEquals(capturedValue, 'Test Post');
        assertEquals((capturedField as { name: string })?.name, 'title');
      },
    );

    await t.step(
      'admin role bypasses row policies in plugin routes',
      async () => {
        await resetDb();

        await db.insert(users).values([
          { email: 'alice@example.com', name: 'Alice' },
          { email: 'bob@example.com', name: 'Bob' },
        ]);

        // Post owned by Bob (user 2)
        await db.insert(posts).values({
          title: 'Bob Post',
          body: 'Content',
          authorId: 2,
        });

        const passwordHash = await getHash('password');
        await db.insert(adminUsers).values({
          email: 'admin@example.com',
          passwordHash,
          role: 'admin',
        });

        let capturedRecord: Record<string, unknown> | undefined;

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithAuth,
          basePath: '/admin',
          auth: {
            secret: AUTH_SECRET,
            provider: new PasswordProvider({ db, usersTable: adminUsers }),
            policies: {
              // adminOr allows admin role to bypass ownership check
              posts: adminOr(ownedBy(posts, 'authorId')),
            },
          },
          plugins: [
            {
              name: 'editor',
              hooks: {},
              filter: 'dangerously-open',
              routes: [
                {
                  pattern: ':table/:id',
                  handler: (ctx: PluginRouteContext) => {
                    capturedRecord = ctx.record;
                    return new Response('OK');
                  },
                },
              ],
            },
          ],
        });

        // Admin user (user 1 with admin role) accessing Bob's post
        const adminPayload = createJwtPayload('1', undefined, 'admin');
        const adminToken = await signJwt(adminPayload, AUTH_SECRET);

        const request = new Request('http://localhost/admin/editor/posts/1', {
          headers: { Cookie: `cms_token=${adminToken}` },
        });
        const response = await handler(request);

        assertEquals(response.status, 200);
        assertEquals(capturedRecord?.title, 'Bob Post');
      },
    );

    await t.step('role-based column visibility in plugin routes', async () => {
      await resetDb();

      await db.insert(users).values({
        email: 'alice@example.com',
        name: 'Alice',
      });

      await db.insert(posts).values({
        title: 'Test Post',
        body: 'Sensitive content',
        authorId: 1,
      });

      const passwordHash = await getHash('password');
      await db.insert(adminUsers).values([
        { email: 'admin@example.com', passwordHash, role: 'admin' },
        { email: 'editor@example.com', passwordHash, role: 'editor' },
      ]);

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithAuth,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: new PasswordProvider({ db, usersTable: adminUsers }),
          policies: {
            posts: {
              columns: {
                // Only admins can see body
                body: { read: (ctx) => ctx.user?.role === 'admin' },
              },
            },
          },
        },
        plugins: [
          {
            name: 'editor',
            hooks: {},
            filter: 'dangerously-open',
            routes: [
              {
                pattern: ':table/:id',
                handler: (ctx: PluginRouteContext) => {
                  return new Response(JSON.stringify(ctx.record), {
                    headers: { 'Content-Type': 'application/json' },
                  });
                },
              },
            ],
          },
        ],
      });

      // Admin can see body
      const adminPayload = createJwtPayload('1', undefined, 'admin');
      const adminToken = await signJwt(adminPayload, AUTH_SECRET);

      const adminRequest = new Request(
        'http://localhost/admin/editor/posts/1',
        {
          headers: { Cookie: `cms_token=${adminToken}` },
        },
      );
      const adminResponse = await handler(adminRequest);
      const adminRecord = await adminResponse.json();

      assertEquals(adminResponse.status, 200);
      assertEquals(adminRecord.body, 'Sensitive content');

      // Editor cannot see body
      const editorPayload = createJwtPayload('2', undefined, 'editor');
      const editorToken = await signJwt(editorPayload, AUTH_SECRET);

      const editorRequest = new Request(
        'http://localhost/admin/editor/posts/1',
        {
          headers: { Cookie: `cms_token=${editorToken}` },
        },
      );
      const editorResponse = await handler(editorRequest);
      const editorRecord = await editorResponse.json();

      assertEquals(editorResponse.status, 200);
      assertEquals(editorRecord.body, undefined);
      assertEquals('body' in editorRecord, false);
    });

    await t.step(
      'plugin route without table/id params skips record fetch',
      async () => {
        await resetDb();

        const passwordHash = await getHash('password');
        await db.insert(adminUsers).values({
          email: 'admin@example.com',
          passwordHash,
        });

        let capturedRecord: Record<string, unknown> | undefined;

        const handler = createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          db,
          schema: schemaWithAuth,
          basePath: '/admin',
          auth: {
            secret: AUTH_SECRET,
            provider: new PasswordProvider({ db, usersTable: adminUsers }),
            policies: {
              posts: () => false, // Would deny if record fetch happened
            },
          },
          plugins: [
            {
              name: 'dashboard',
              hooks: {},
              filter: 'dangerously-open',
              routes: [
                {
                  // Route without :table/:id params
                  pattern: 'stats',
                  handler: (ctx: PluginRouteContext) => {
                    capturedRecord = ctx.record;
                    return new Response('OK');
                  },
                },
              ],
            },
          ],
        });

        const payload = createJwtPayload('1');
        const token = await signJwt(payload, AUTH_SECRET);

        const request = new Request('http://localhost/admin/dashboard/stats', {
          headers: { Cookie: `cms_token=${token}` },
        });
        const response = await handler(request);

        assertEquals(response.status, 200);
        // Record should be empty object (no fetch happened)
        assertEquals(capturedRecord, {});
      },
    );

    client.close();
  },
});
