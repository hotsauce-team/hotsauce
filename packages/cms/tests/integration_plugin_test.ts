// Plugin Integration Tests
// Tests plugin hooks with real database

import { assertEquals } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  createBasicTables,
  schema,
  TEST_CSRF_SECRET,
  users,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';

Deno.test('integration: plugin afterRead transform', async (t) => {
  // Create fresh PGlite instance for plugin tests
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await createBasicTables(db);

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
      policies: 'dangerously-open',
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
      policies: 'dangerously-open',
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
      policies: 'dangerously-open',
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
