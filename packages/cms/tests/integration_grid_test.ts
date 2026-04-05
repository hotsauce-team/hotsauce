// Grid View Integration Tests
// Tests handleList grid/table views and RHS detail panel for thumbnail-enabled tables

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  createMediaTable,
  media,
  schemaWithMedia,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import { generateSourceToken, SOURCE } from '../tokens/mod.ts';
import { createFormData } from './integration_helpers.ts';

Deno.test('integration: grid view tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithMedia });

  await createMediaTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE media RESTART IDENTITY CASCADE`);
  }

  function createHandler() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithMedia,
      basePath: '/admin',
    });
  }

  await t.step(
    'list defaults to grid view when thumbnail column exists',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'Photo One',
          file: {
            filename: 'photo1.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/photo1.jpg',
          },
        },
        {
          title: 'Photo Two',
          file: {
            filename: 'photo2.png',
            contentType: 'image/png',
            size: 2048,
            url: 'https://example.com/photo2.png',
          },
        },
      ]);

      const handler = createHandler();
      const request = new Request('http://localhost/admin/media');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'cms-grid');
      assertStringIncludes(html, 'photo1.jpg');
      assertStringIncludes(html, 'photo2.png');
      assertStringIncludes(html, 'cms-view-toggle');
    },
  );

  await t.step('list shows table view when ?view=table', async () => {
    await resetDb();
    await db.insert(media).values([
      {
        title: 'Photo One',
        file: { filename: 'photo1.jpg', contentType: 'image/jpeg', size: 1024 },
      },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/media?view=table');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'cms-table');
    assertStringIncludes(html, 'cms-view-toggle');
    assertStringIncludes(html, 'Photo One');
  });

  await t.step('grid view shows empty state', async () => {
    await resetDb();

    const handler = createHandler();
    const request = new Request('http://localhost/admin/media');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'No records found');
    assertStringIncludes(html, 'cms-view-toggle');
  });

  await t.step(
    'grid view resolves thumbnail URL from FileReference',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'URL Photo',
          file: {
            filename: 'pic.jpg',
            contentType: 'image/jpeg',
            size: 512,
            url: 'https://cdn.example.com/pic.jpg',
          },
        },
      ]);

      const handler = createHandler();
      const request = new Request('http://localhost/admin/media');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'https://cdn.example.com/pic.jpg');
    },
  );

  await t.step('grid view uses filename as fallback label', async () => {
    await resetDb();
    await db.insert(media).values([
      {
        title: '',
        file: { filename: 'fallback.png', contentType: 'image/png', size: 100 },
      },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/media');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'fallback.png');
  });

  // ─── Panel Tests ─────────────────────────────────────────────

  await t.step('?selected=<id> renders RHS detail panel', async () => {
    await resetDb();
    await db.insert(media).values([
      {
        title: 'Selected Photo',
        file: {
          filename: 'selected.jpg',
          contentType: 'image/jpeg',
          size: 2048,
          url: 'https://cdn.example.com/selected.jpg',
        },
      },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/media?selected=1');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    // Should render grid + panel layout
    assertStringIncludes(html, 'cms-grid-panel-layout');
    assertStringIncludes(html, 'cms-grid-panel');
    // Panel should show larger preview
    assertStringIncludes(html, 'cms-panel-preview');
    // Panel should show file metadata
    assertStringIncludes(html, 'selected.jpg');
    assertStringIncludes(html, 'image/jpeg');
    // Panel should show edit form with title field
    assertStringIncludes(html, 'name="title"');
    assertStringIncludes(html, 'Selected Photo');
    // Panel should have Save and Delete buttons
    assertStringIncludes(html, 'Save');
    assertStringIncludes(html, 'Delete');
    // Panel should have __cms_return hidden field pointing back with ?selected to keep panel open
    assertStringIncludes(html, '__cms_return');
    assertStringIncludes(html, '?selected=1');
    // Selected grid item should be highlighted
    assertStringIncludes(html, 'cms-grid-item-selected');
  });

  await t.step('?selected with invalid id shows no panel', async () => {
    await resetDb();
    await db.insert(media).values([
      {
        title: 'Some Photo',
        file: { filename: 'some.jpg', contentType: 'image/jpeg', size: 100 },
      },
    ]);

    const handler = createHandler();
    const request = new Request('http://localhost/admin/media?selected=999');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    // Should still render the grid
    assertStringIncludes(html, 'cms-grid');
    // Should NOT render the panel
    assertEquals(html.includes('cms-grid-panel'), false);
  });

  await t.step(
    'panel close button links back to grid without ?selected',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'Close Test',
          file: { filename: 'close.jpg', contentType: 'image/jpeg', size: 100 },
        },
      ]);

      const handler = createHandler();
      const request = new Request('http://localhost/admin/media?selected=1');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'cms-panel-close');
    },
  );
});

// ─── Update/Delete __cms_return redirect tests ──────────────────────

Deno.test('integration: __cms_return redirect tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithMedia });

  await createMediaTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE media RESTART IDENTITY CASCADE`);
  }

  function createHandler() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithMedia,
      basePath: '/admin',
    });
  }

  await t.step(
    'update redirects to __cms_return URL when present',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'Original',
          file: { filename: 'orig.jpg', contentType: 'image/jpeg', size: 100 },
        },
      ]);

      const handler = createHandler();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      const formData = createFormData({
        _csrf: csrfToken,
        _source: sourceToken,
        title: 'Updated',
        __cms_return: '/admin/media',
      });

      const request = new Request('http://localhost/admin/media/1/edit', {
        method: 'POST',
        body: formData,
      });

      const response = await handler(request);
      assertEquals(response.status, 303);
      assertEquals(response.headers.get('Location'), '/admin/media');
    },
  );

  await t.step(
    'update ignores __cms_return with absolute URL (security)',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'Test',
          file: { filename: 'test.jpg', contentType: 'image/jpeg', size: 100 },
        },
      ]);

      const handler = createHandler();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      const formData = createFormData({
        _csrf: csrfToken,
        _source: sourceToken,
        title: 'Updated',
        __cms_return: 'https://evil.com/steal',
      });

      const request = new Request('http://localhost/admin/media/1/edit', {
        method: 'POST',
        body: formData,
      });

      const response = await handler(request);
      assertEquals(response.status, 303);
      // Should fall back to default redirect, not the evil URL
      assertEquals(response.headers.get('Location'), '/admin/media/1');
    },
  );

  await t.step('update ignores __cms_return outside basePath', async () => {
    await resetDb();
    await db.insert(media).values([
      {
        title: 'Test',
        file: { filename: 'test.jpg', contentType: 'image/jpeg', size: 100 },
      },
    ]);

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    const formData = createFormData({
      _csrf: csrfToken,
      _source: sourceToken,
      title: 'Updated',
      __cms_return: '/other-path',
    });

    const request = new Request('http://localhost/admin/media/1/edit', {
      method: 'POST',
      body: formData,
    });

    const response = await handler(request);
    assertEquals(response.status, 303);
    assertEquals(response.headers.get('Location'), '/admin/media/1');
  });

  await t.step(
    'delete redirects to __cms_return URL when present',
    async () => {
      await resetDb();
      await db.insert(media).values([
        {
          title: 'To Delete',
          file: { filename: 'del.jpg', contentType: 'image/jpeg', size: 100 },
        },
      ]);

      const handler = createHandler();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      const formData = createFormData({
        _csrf: csrfToken,
        _source: sourceToken,
        __cms_return: '/admin/media',
      });

      const request = new Request('http://localhost/admin/media/1/delete', {
        method: 'POST',
        body: formData,
      });

      const response = await handler(request);
      assertEquals(response.status, 303);
      const location = response.headers.get('Location') ?? '';
      assertEquals(location.startsWith('/admin/media'), true);
    },
  );
});
