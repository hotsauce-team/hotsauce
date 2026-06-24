// Grid View Integration Tests
// Tests handleList grid/table views and RHS detail panel for thumbnail-enabled tables

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  integer,
  json,
  pgTable,
  serial,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  AUTH_SECRET,
  createMediaTable,
  media,
  schemaWithMedia,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import {
  createCmsHandler,
  createJwtPayload,
  ownedBy,
  signJwt,
} from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import { generateSourceToken, SOURCE } from '../tokens/mod.ts';
import { createFormData } from './integration_helpers.ts';
import type { AuthProvider } from '@hotsauce/auth';

// Import extend module for side effects (patches Drizzle prototypes)
import '@hotsauce/core/extend';

// Minimal no-op AuthProvider for policy tests
const noopAuthProvider: AuthProvider = {
  authenticate() {
    return Promise.resolve(null);
  },
};

// Schema with thumbnail + ownerId for row policy testing
const ownedMedia = pgTable('owned_media', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  ownerId: integer('owner_id').notNull(),
  file: json('file').$cms({ file: { accept: 'image/*' }, thumbnail: true }),
  secretField: text('secret_field'),
});

const schemaWithOwnedMedia = { ownedMedia };

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
      // Grid thumbnails use proxy URL, not the direct/presigned URL
      assertStringIncludes(html, '/admin/files/media/file/1');
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

  await t.step(
    'view toggle hidden when thumbnail column is hidden by column policy',
    async () => {
      // When the file column is read-hidden for the current user, thumbnailField
      // is undefined so the list falls back to table view with no toggle button.
      await resetDb();
      await db.insert(media).values([
        {
          title: 'Hidden thumbnail',
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
          },
        },
      ]);

      // With no policy, toggle should appear (baseline)
      const openHandler = createHandler();
      const openRequest = new Request(
        'http://localhost/admin/media?view=table',
      );
      const openResponse = await openHandler(openRequest);
      assertEquals(openResponse.status, 200);
      const openHtml = await openResponse.text();
      assertStringIncludes(
        openHtml,
        'cms-view-toggle',
        'toggle should appear when column is visible',
      );

      // With file column hidden, toggle must not appear
      const hiddenHandler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: {
          media: {
            columns: {
              file: { read: () => false },
            },
          },
        },
        db,
        schema: schemaWithMedia,
        basePath: '/admin',
      });
      const hiddenRequest = new Request(
        'http://localhost/admin/media?view=table',
      );
      const hiddenResponse = await hiddenHandler(hiddenRequest);
      assertEquals(hiddenResponse.status, 200);
      const hiddenHtml = await hiddenResponse.text();
      assertEquals(
        hiddenHtml.includes('cms-view-toggle'),
        false,
        'toggle must not appear when thumbnail column is policy-hidden',
      );
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
        __cms_csrf: csrfToken,
        __cms_source: sourceToken,
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
        __cms_csrf: csrfToken,
        __cms_source: sourceToken,
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
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
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
        __cms_csrf: csrfToken,
        __cms_source: sourceToken,
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

  await t.step(
    'update ignores __cms_return with control characters (security)',
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

      // Newline could enable header injection
      const formData = createFormData({
        __cms_csrf: csrfToken,
        __cms_source: sourceToken,
        title: 'Updated',
        __cms_return: '/admin/media\r\nX-Injected: bad',
      });

      const request = new Request('http://localhost/admin/media/1/edit', {
        method: 'POST',
        body: formData,
      });

      const response = await handler(request);
      assertEquals(response.status, 303);
      assertEquals(response.headers.get('Location'), '/admin/media/1');
    },
  );

  await t.step(
    'update ignores __cms_return with backslash (security)',
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

      // Backslash can be interpreted as / by some browsers
      const formData = createFormData({
        __cms_csrf: csrfToken,
        __cms_source: sourceToken,
        title: 'Updated',
        __cms_return: '/admin\\evil.com',
      });

      const request = new Request('http://localhost/admin/media/1/edit', {
        method: 'POST',
        body: formData,
      });

      const response = await handler(request);
      assertEquals(response.status, 303);
      assertEquals(response.headers.get('Location'), '/admin/media/1');
    },
  );

  await t.step(
    'grid view skips signing for tampered file key (security)',
    async () => {
      await resetDb();

      // Insert record with a TAMPERED key (wrong table prefix)
      await db.insert(media).values([
        {
          title: 'Tampered Record',
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            key: 'other_table/file/999/malicious.jpg', // Wrong prefix!
            storage: 's3',
          },
        },
      ]);

      let signCalled = false;
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithMedia,
        basePath: '/admin',
        plugins: [
          {
            name: 'mock-s3',
            storageProvider: {
              id: 's3',
              kind: 's3' as const,
              presignUpload: () =>
                Promise.resolve({
                  key: '',
                  upload: { method: 'PUT' as const, url: '' },
                }),
              signDownloadUrl: () => {
                signCalled = true;
                return Promise.resolve('https://s3.example.com/signed');
              },
            },
          },
        ],
        storage: 's3',
      });

      const request = new Request('http://localhost/admin/media');
      const response = await handler(request);

      assertEquals(response.status, 200);
      // Should NOT have called signDownloadUrl for the tampered key
      assertEquals(signCalled, false, 'Should not sign tampered file key');
    },
  );

  await t.step(
    'grid panel skips signing for tampered file key (security)',
    async () => {
      await resetDb();

      // Insert record with a TAMPERED key
      await db.insert(media).values([
        {
          title: 'Tampered Panel Record',
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            key: 'wrong_table/file/1/malicious.jpg', // Wrong prefix!
            storage: 's3',
          },
        },
      ]);

      let signCalled = false;
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithMedia,
        basePath: '/admin',
        plugins: [
          {
            name: 'mock-s3',
            storageProvider: {
              id: 's3',
              kind: 's3' as const,
              presignUpload: () =>
                Promise.resolve({
                  key: '',
                  upload: { method: 'PUT' as const, url: '' },
                }),
              signDownloadUrl: () => {
                signCalled = true;
                return Promise.resolve('https://s3.example.com/signed');
              },
            },
          },
        ],
        storage: 's3',
      });

      // Request with ?selected=1 to trigger panel rendering
      const request = new Request('http://localhost/admin/media?selected=1');
      const response = await handler(request);

      assertEquals(response.status, 200);
      // Should NOT have called signDownloadUrl for the tampered key
      assertEquals(
        signCalled,
        false,
        'Should not sign tampered file key in panel',
      );
    },
  );

  await t.step(
    'grid uses proxy URL instead of signing for S3 files',
    async () => {
      await resetDb();

      // Insert record with a VALID key (correct prefix: media/file/1/...)
      await db.insert(media).values([
        {
          title: 'Valid Record',
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            key: 'media/file/1/valid-uuid.jpg', // Correct prefix!
            storage: 's3',
          },
        },
      ]);

      let signCalled = false;
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithMedia,
        basePath: '/admin',
        plugins: [
          {
            name: 'mock-s3',
            storageProvider: {
              id: 's3',
              kind: 's3' as const,
              presignUpload: () =>
                Promise.resolve({
                  key: '',
                  upload: { method: 'PUT' as const, url: '' },
                }),
              signDownloadUrl: (_ctx) => {
                signCalled = true;
                return Promise.resolve('https://s3.example.com/signed');
              },
            },
          },
        ],
        storage: 's3',
      });

      const request = new Request('http://localhost/admin/media');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      // Grid thumbnails use proxy URL — no signing at render time
      assertEquals(signCalled, false, 'Should not sign at grid render time');
      assertStringIncludes(html, '/admin/files/media/file/1');
    },
  );
});

// ============================================================================
// Grid Policy Tests
// ============================================================================

Deno.test('integration: grid policy tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithOwnedMedia });

  // Create owned_media table
  await db.execute(sql`
    CREATE TABLE owned_media (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      owner_id INTEGER NOT NULL,
      file JSON,
      secret_field TEXT
    )
  `);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE owned_media RESTART IDENTITY CASCADE`);
  }

  await t.step(
    'grid panel denies access to record user does not own (row policy)',
    async () => {
      await resetDb();

      // Insert record owned by user 2
      await db.insert(ownedMedia).values([
        {
          title: 'User 2 Photo',
          ownerId: 2,
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/photo.jpg',
          },
        },
      ]);

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithOwnedMedia,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: noopAuthProvider,
        },
        policies: {
          owned_media: ownedBy(ownedMedia, 'ownerId'),
        },
      });

      // User 1 requests ?selected=1 (record owned by user 2)
      const user1Payload = createJwtPayload('1');
      const user1Token = await signJwt(user1Payload, AUTH_SECRET);

      const request = new Request(
        'http://localhost/admin/owned_media?selected=1',
        {
          headers: { Cookie: `cms_token=${user1Token}` },
        },
      );
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();

      // Should render grid but no panel (record not accessible)
      assertStringIncludes(html, 'cms-grid');
      assertEquals(
        html.includes('cms-grid-panel'),
        false,
        'Panel should not render for inaccessible record',
      );
    },
  );

  await t.step(
    'grid panel shows record to owner (row policy allows)',
    async () => {
      await resetDb();

      // Insert record owned by user 1
      await db.insert(ownedMedia).values([
        {
          title: 'User 1 Photo',
          ownerId: 1,
          file: {
            filename: 'my-photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/my-photo.jpg',
          },
        },
      ]);

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithOwnedMedia,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: noopAuthProvider,
        },
        policies: {
          owned_media: ownedBy(ownedMedia, 'ownerId'),
        },
      });

      // User 1 requests ?selected=1 (their own record)
      const user1Payload = createJwtPayload('1');
      const user1Token = await signJwt(user1Payload, AUTH_SECRET);

      const request = new Request(
        'http://localhost/admin/owned_media?selected=1',
        {
          headers: { Cookie: `cms_token=${user1Token}` },
        },
      );
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();

      // Should render panel for owned record
      assertStringIncludes(html, 'cms-grid-panel');
      assertStringIncludes(html, 'User 1 Photo');
    },
  );

  await t.step(
    'grid panel hides columns per column policy',
    async () => {
      await resetDb();

      // Insert record with secret field
      await db.insert(ownedMedia).values([
        {
          title: 'Photo with Secret',
          ownerId: 1,
          file: {
            filename: 'photo.jpg',
            contentType: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/photo.jpg',
          },
          secretField: 'TOP SECRET DATA',
        },
      ]);

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        db,
        schema: schemaWithOwnedMedia,
        basePath: '/admin',
        auth: {
          secret: AUTH_SECRET,
          provider: noopAuthProvider,
        },
        policies: {
          owned_media: {
            row: ownedBy(ownedMedia, 'ownerId'),
            columns: {
              secretField: { read: () => false }, // Always hidden
            },
          },
        },
      });

      // User 1 requests their record
      const user1Payload = createJwtPayload('1');
      const user1Token = await signJwt(user1Payload, AUTH_SECRET);

      const request = new Request(
        'http://localhost/admin/owned_media?selected=1',
        {
          headers: { Cookie: `cms_token=${user1Token}` },
        },
      );
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();

      // Should render panel
      assertStringIncludes(html, 'cms-grid-panel');
      assertStringIncludes(html, 'Photo with Secret');

      // secretField should NOT appear (column policy hides it)
      assertEquals(
        html.includes('TOP SECRET DATA'),
        false,
        'Secret field value should be hidden',
      );
      assertEquals(
        html.includes('secret_field'),
        false,
        'Secret field name should not appear in form',
      );
    },
  );
});
