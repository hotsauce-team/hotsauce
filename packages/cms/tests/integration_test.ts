// Basic CRUD Integration Tests
// Tests the full handler → DB flow using PGlite
// Uses shared database instances with TRUNCATE for speed

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  createBasicTables,
  createFormData,
  generateSourceToken,
  posts,
  schema,
  SOURCE,
  TEST_CSRF_SECRET,
  users,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';

// ============================================================================
// Basic Integration Tests (shared PGlite instance)
// ============================================================================

Deno.test('integration: basic CRUD tests', async (t) => {
  // Create single PGlite instance for all basic tests
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await createBasicTables(db);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`);
  }

  // Helper to create handler
  function createHandler() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
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

  await t.step(
    'dashboard shows correct record counts and pluralization',
    async () => {
      await resetDb();
      const handler = createHandler();

      // Insert 1 user and 2 posts (posts require authorId FK)
      const insertResult = await db.insert(users).values({
        email: 'a@test.com',
        name: 'A',
      }).returning();
      const userId = insertResult[0]!.id;
      await db.insert(posts).values([
        { title: 'Post 1', authorId: userId },
        { title: 'Post 2', authorId: userId },
      ]);

      const request = new Request('http://localhost/admin');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertEquals(
        /<h3>Users<\/h3>\s*<p>1 record<\/p>/.test(html),
        true,
      );
      assertEquals(
        /<h3>Posts<\/h3>\s*<p>2 records<\/p>/.test(html),
        true,
      );
    },
  );

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
    assertStringIncludes(html, 'name="__cms_csrf"');
    assertStringIncludes(html, 'name="email"');
    assertStringIncludes(html, 'name="name"');
  });

  await t.step('create record via POST', async () => {
    await resetDb();
    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);
    const formData = createFormData({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
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
    assertStringIncludes(html, 'name="__cms_csrf"');
  });

  await t.step('update record via POST', async () => {
    await resetDb();
    await db.insert(users).values({
      email: 'update@example.com',
      name: 'Before Update',
    });

    const handler = createHandler();

    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);
    const formData = createFormData({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
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
      __cms_csrf: csrfToken,
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
      '_flash=delete_csrf_error',
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
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);
    const formData = createFormData({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
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
      policies: 'dangerously-open',
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
