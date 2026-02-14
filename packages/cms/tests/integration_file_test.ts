// File Upload Integration Tests
// Tests file upload, serving, and clearing with real database

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  createProfilesTable,
  generateSourceToken,
  profiles,
  schemaWithFiles,
  SOURCE,
  TEST_CSRF_SECRET,
  TEST_PDF_HEADER,
  TEST_PNG_1X1_RED,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';

Deno.test('integration: file upload tests', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithFiles });

  await createProfilesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE profiles RESTART IDENTITY CASCADE`);
  }

  function createHandler() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithFiles,
      basePath: '/admin',
    });
  }

  await t.step(
    'create form has multipart encoding for file fields',
    async () => {
      const handler = createHandler();
      const request = new Request('http://localhost/admin/profiles/new');
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'enctype="multipart/form-data"');
      assertStringIncludes(html, 'type="file"');
    },
  );

  await t.step('edit form has multipart encoding for file fields', async () => {
    await resetDb();
    await db.insert(profiles).values({ name: 'Test Profile' });

    const handler = createHandler();
    const request = new Request('http://localhost/admin/profiles/1/edit');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'enctype="multipart/form-data"');
  });

  await t.step('uploads file and stores as FileReference', async () => {
    await resetDb();

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Profile with Avatar');
    formData.append(
      'avatar',
      new Blob([TEST_PNG_1X1_RED], { type: 'image/png' }),
      'avatar.png',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 303);

    // Verify the profile was created with file data
    const [profile] = await db.select().from(profiles);
    assertEquals(profile?.name, 'Profile with Avatar');

    // Check avatar is a valid FileReference
    const avatar = profile?.avatar as {
      filename: string;
      contentType: string;
      size: number;
      data: string;
    } | null;
    assertEquals(avatar?.filename, 'avatar.png');
    assertEquals(avatar?.contentType, 'image/png');
    assertEquals(avatar?.size, TEST_PNG_1X1_RED.length);
    assertEquals(typeof avatar?.data, 'string'); // base64
  });

  await t.step('serves uploaded file', async () => {
    await resetDb();

    // Create profile with avatar
    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Profile for Download',
      avatar: {
        filename: 'test.png',
        contentType: 'image/png',
        size: TEST_PNG_1X1_RED.length,
        data: base64Data,
      },
    });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('Content-Type'), 'image/png');
    assertEquals(
      response.headers.get('Content-Disposition'),
      'inline; filename="test.png"',
    );

    const body = await response.arrayBuffer();
    assertEquals(body.byteLength, TEST_PNG_1X1_RED.length);
  });

  await t.step('detail view shows image preview for image files', async () => {
    await resetDb();

    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Profile with Image',
      avatar: {
        filename: 'photo.png',
        contentType: 'image/png',
        size: TEST_PNG_1X1_RED.length,
        data: base64Data,
      },
    });

    const handler = createHandler();
    const request = new Request('http://localhost/admin/profiles/1');
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'photo.png');
    assertStringIncludes(html, 'cms-file-preview'); // Preview img class
  });

  await t.step('clears file when delete button clicked', async () => {
    await resetDb();

    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Profile to Clear',
      avatar: {
        filename: 'to-delete.png',
        contentType: 'image/png',
        size: TEST_PNG_1X1_RED.length,
        data: base64Data,
      },
    });

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Submit with _clear_avatar=1
    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Profile to Clear');
    formData.append('_clear_avatar', '1');

    const request = new Request('http://localhost/admin/profiles/1', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 303);

    // Verify avatar was cleared
    const [profile] = await db.select().from(profiles);
    assertEquals(profile?.avatar, null);
  });

  await t.step('rejects file exceeding maxSize', async () => {
    await resetDb();

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Document field has maxSize of 1MB, create a larger file
    const largeContent = new Uint8Array(1024 * 1024 + 1); // 1MB + 1 byte

    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Profile with Large Doc');
    formData.append(
      'document',
      new Blob([largeContent], { type: 'application/pdf' }),
      'large.pdf',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    // Should show form with error, not redirect
    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'File too large');
  });

  await t.step('rejects file with wrong content type', async () => {
    await resetDb();

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Document field accepts only PDF
    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Profile with Wrong Type');
    formData.append(
      'document',
      new Blob([TEST_PNG_1X1_RED], { type: 'image/png' }),
      'image.png',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    // Should show form with error
    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid file type');
  });

  await t.step('accepts file with valid content type', async () => {
    await resetDb();

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Profile with PDF');
    formData.append(
      'document',
      new Blob([TEST_PDF_HEADER], { type: 'application/pdf' }),
      'doc.pdf',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 303);

    const [profile] = await db.select().from(profiles);
    const doc = profile?.document as { filename: string } | null;
    assertEquals(doc?.filename, 'doc.pdf');
  });

  await t.step('returns 404 for non-existent file', async () => {
    await resetDb();

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/999',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step('returns 404 for file route with no data', async () => {
    await resetDb();

    // Create profile without avatar
    await db.insert(profiles).values({ name: 'No Avatar' });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await client.close();
});
