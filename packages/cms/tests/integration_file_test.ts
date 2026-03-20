// File Upload Integration Tests
// Tests file upload, serving, and clearing with real database

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  AUTH_SECRET,
  createProfilesTable,
  generateSourceToken,
  profiles,
  schemaWithFiles,
  SOURCE,
  TEST_CSRF_SECRET,
  TEST_PDF_HEADER,
  TEST_PNG_1X1_RED,
} from './integration_helpers.ts';
import { createCmsHandler, createJwtPayload, signJwt } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import type { AuthProvider } from '@hotsauce/auth';

/** Minimal no-op AuthProvider — just enables JWT auth without needing a users table */
const noopAuthProvider: AuthProvider = {
  authenticate() {
    return Promise.resolve(null);
  },
};

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

  // ──────────────────────────────────────────────────────────
  // URL redirect tests (file serving when FileReference.url exists)
  // ──────────────────────────────────────────────────────────

  await t.step('redirects to url when FileReference has url', async () => {
    await resetDb();

    await db.insert(profiles).values({
      name: 'Profile with URL',
      avatar: {
        filename: 'remote.png',
        contentType: 'image/png',
        size: 1024,
        url: 'https://cdn.example.com/images/remote.png',
      },
    });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 302);
    assertEquals(
      response.headers.get('Location'),
      'https://cdn.example.com/images/remote.png',
    );
  });

  await t.step(
    'returns 404 for unsafe url protocol (javascript:)',
    async () => {
      await resetDb();

      await db.insert(profiles).values({
        name: 'Malicious URL',
        avatar: {
          filename: 'evil.png',
          contentType: 'image/png',
          size: 100,
          url: 'javascript:alert(1)',
        },
      });

      const handler = createHandler();
      const request = new Request(
        'http://localhost/admin/files/profiles/avatar/1',
      );
      const response = await handler(request);

      // Must be 404 (not 403) to avoid leaking file existence
      assertEquals(response.status, 404);
    },
  );

  await t.step('returns 404 for unsafe url protocol (ftp:)', async () => {
    await resetDb();

    await db.insert(profiles).values({
      name: 'FTP URL',
      avatar: {
        filename: 'file.png',
        contentType: 'image/png',
        size: 100,
        url: 'ftp://evil.example.com/file.png',
      },
    });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step('returns 404 for malformed url', async () => {
    await resetDb();

    await db.insert(profiles).values({
      name: 'Bad URL',
      avatar: {
        filename: 'broken.png',
        contentType: 'image/png',
        size: 100,
        url: 'not-a-valid-url',
      },
    });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  // ──────────────────────────────────────────────────────────
  // File replacement on update
  // ──────────────────────────────────────────────────────────

  await t.step('replaces existing file with new upload', async () => {
    await resetDb();

    // Create profile with initial avatar
    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Replace Test',
      avatar: {
        filename: 'old.png',
        contentType: 'image/png',
        size: TEST_PNG_1X1_RED.length,
        data: base64Data,
      },
    });

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Upload a new avatar (PDF pretending to be image for size difference)
    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Replace Test');
    formData.append(
      'avatar',
      new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' }),
      'new-avatar.png',
    );

    const request = new Request('http://localhost/admin/profiles/1', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 303);

    // Verify file was replaced
    const [profile] = await db.select().from(profiles);
    const avatar = profile?.avatar as {
      filename: string;
      contentType: string;
      size: number;
      data: string;
    } | null;
    assertEquals(avatar?.filename, 'new-avatar.png');
    assertEquals(avatar?.size, 5);
  });

  // ──────────────────────────────────────────────────────────
  // CSRF rejection
  // ──────────────────────────────────────────────────────────

  await t.step('rejects file upload without CSRF token', async () => {
    await resetDb();

    const handler = createHandler();

    const formData = new FormData();
    // Deliberately omit _csrf and _source
    formData.append('name', 'Should Fail');
    formData.append(
      'avatar',
      new Blob([TEST_PNG_1X1_RED], { type: 'image/png' }),
      'test.png',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    // CSRF failure re-renders form with error message (not 303 redirect)
    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid or expired form');

    // Verify no profile was created
    const allProfiles = await db.select().from(profiles);
    assertEquals(allProfiles.length, 0);
  });

  await t.step('rejects file upload with invalid CSRF token', async () => {
    await resetDb();

    const handler = createHandler();

    const formData = new FormData();
    formData.append('_csrf', 'completely-invalid-token');
    formData.append('_source', 'also-invalid');
    formData.append('name', 'Should Fail');
    formData.append(
      'avatar',
      new Blob([TEST_PNG_1X1_RED], { type: 'image/png' }),
      'test.png',
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    // CSRF failure re-renders form with error message (not 303 redirect)
    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid or expired form');

    // Verify no profile was created
    const allProfiles = await db.select().from(profiles);
    assertEquals(allProfiles.length, 0);
  });

  // ──────────────────────────────────────────────────────────
  // Additional file serving edge cases
  // ──────────────────────────────────────────────────────────

  await t.step('returns 404 for non-file column', async () => {
    await resetDb();

    await db.insert(profiles).values({ name: 'Test' });

    const handler = createHandler();
    // 'name' is not a file column
    const request = new Request(
      'http://localhost/admin/files/profiles/name/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step('returns 404 for non-existent table in file route', async () => {
    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/nonexistent/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 404);
  });

  await t.step(
    'returns 404 for non-existent column in file route',
    async () => {
      await resetDb();

      await db.insert(profiles).values({ name: 'Test' });

      const handler = createHandler();
      const request = new Request(
        'http://localhost/admin/files/profiles/nonexistent/1',
      );
      const response = await handler(request);

      assertEquals(response.status, 404);
    },
  );

  await t.step('serves SVG as attachment (not inline)', async () => {
    await resetDb();

    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const base64Data = btoa(svgContent);
    await db.insert(profiles).values({
      name: 'SVG Test',
      avatar: {
        filename: 'icon.svg',
        contentType: 'image/svg+xml',
        size: svgContent.length,
        data: base64Data,
      },
    });

    const handler = createHandler();
    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
    );
    const response = await handler(request);

    assertEquals(response.status, 200);
    const disposition = response.headers.get('Content-Disposition');
    assertStringIncludes(disposition ?? '', 'attachment');
  });

  await t.step('sets strict CSP on served files', async () => {
    await resetDb();

    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'CSP Test',
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
    const csp = response.headers.get('Content-Security-Policy');
    assertStringIncludes(csp ?? '', "script-src 'none'");
    assertStringIncludes(csp ?? '', 'sandbox');
  });

  await t.step('sets Cache-Control on served files', async () => {
    await resetDb();

    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Cache Test',
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
    const cacheControl = response.headers.get('Cache-Control');
    assertStringIncludes(cacheControl ?? '', 'private');
  });

  await t.step(
    'returns 404 for FileReference with no data or url',
    async () => {
      await resetDb();

      // Insert a FileReference that has neither data nor url
      await db.insert(profiles).values({
        name: 'No Data Test',
        avatar: {
          filename: 'ghost.png',
          contentType: 'image/png',
          size: 1024,
          // no data, no url — just metadata
        },
      });

      const handler = createHandler();
      const request = new Request(
        'http://localhost/admin/files/profiles/avatar/1',
      );
      const response = await handler(request);

      assertEquals(response.status, 404);
    },
  );

  await client.close();
});

// ============================================================================
// Policy-gated file serving tests
// ============================================================================

Deno.test('integration: policy-gated file serving', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithFiles });

  await createProfilesTable(db);

  async function resetDb() {
    await db.execute(sql`TRUNCATE TABLE profiles RESTART IDENTITY CASCADE`);
  }

  // Insert a profile with a file for all sub-tests
  async function seedProfile() {
    await resetDb();
    const base64Data = btoa(String.fromCharCode(...TEST_PNG_1X1_RED));
    await db.insert(profiles).values({
      name: 'Policy Test',
      avatar: {
        filename: 'secret.png',
        contentType: 'image/png',
        size: TEST_PNG_1X1_RED.length,
        data: base64Data,
      },
    });
  }

  await t.step('row policy denial returns 404 (not 403)', async () => {
    await seedProfile();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithFiles,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: noopAuthProvider,
      },
      policies: {
        // Deny all reads on profiles
        profiles: { read: () => false as const },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
      { headers: { Cookie: `cms_token=${token}` } },
    );
    const response = await handler(request);

    // Must be 404, not 403 — avoid leaking that the record exists
    assertEquals(response.status, 404);
  });

  await t.step('column policy denial returns 404 (not 403)', async () => {
    await seedProfile();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithFiles,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: noopAuthProvider,
      },
      policies: {
        profiles: {
          columns: {
            // Hide avatar column from all users
            avatar: { read: () => false },
          },
        },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
      { headers: { Cookie: `cms_token=${token}` } },
    );
    const response = await handler(request);

    // Must be 404, not 403 — avoid leaking that the column has data
    assertEquals(response.status, 404);
  });

  await t.step('allowed policy serves file normally', async () => {
    await seedProfile();

    const handler = createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithFiles,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: noopAuthProvider,
      },
      policies: {
        // Allow all reads
        profiles: { read: () => undefined },
      },
    });

    const payload = createJwtPayload('1');
    const token = await signJwt(payload, AUTH_SECRET);

    const request = new Request(
      'http://localhost/admin/files/profiles/avatar/1',
      { headers: { Cookie: `cms_token=${token}` } },
    );
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get('Content-Type'), 'image/png');
  });

  await client.close();
});

// ============================================================================
// File key tampering prevention tests (Finding 2)
// ============================================================================

Deno.test('integration: file key tampering prevention', async (t) => {
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

  function createHandlerWithStorage() {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema: schemaWithFiles,
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
          },
        },
      ],
      storage: 's3',
    });
  }

  await t.step('create rejects file ref with storage key', async () => {
    await resetDb();

    const handler = createHandler();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Attempt to submit a file reference with a storage key during CREATE
    // This should be rejected - presign requires existing record ID
    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Tampered Create');
    formData.append(
      'avatar',
      JSON.stringify({
        filename: 'tampered.png',
        contentType: 'image/png',
        size: 1234,
        key: 'profiles/avatar/999/fake-key.png',
        storage: 's3',
      }),
    );

    const request = new Request('http://localhost/admin/profiles/new', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    // Should render form with error, not redirect
    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(
      html,
      'Storage-backed files cannot be attached during create',
    );
  });

  await t.step(
    'create rejects file ref with storage key (JSON API)',
    async () => {
      await resetDb();

      const handler = createHandler();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Tampered Create JSON');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'tampered.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/999/fake-key.png',
        }),
      );

      const request = new Request('http://localhost/admin/profiles/new', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });
      const response = await handler(request);

      assertEquals(response.status, 400);
      const json = await response.json();
      assertEquals(json.success, false);
      assertEquals(json.action, 'create');
      assertStringIncludes(
        json.errors.avatar[0],
        'Storage-backed files cannot be attached',
      );
    },
  );

  await t.step(
    'update rejects file ref with wrong record ID in key',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Original Profile' });

      const handler = createHandlerWithStorage();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Attempt to submit a key that belongs to record ID 999 when editing record ID 1
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Tampered Update');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'stolen.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/999/stolen-file.png', // Wrong record ID!
          storage: 's3',
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'Invalid file reference');
    },
  );

  await t.step('update rejects file ref with wrong table in key', async () => {
    await resetDb();
    await db.insert(profiles).values({ name: 'Target Profile' });

    const handler = createHandlerWithStorage();
    const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
    const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

    // Key from a different table
    const formData = new FormData();
    formData.append('_csrf', csrfToken);
    formData.append('_source', sourceToken);
    formData.append('name', 'Cross-Table Attack');
    formData.append(
      'avatar',
      JSON.stringify({
        filename: 'cross-table.png',
        contentType: 'image/png',
        size: 1234,
        key: 'other_table/avatar/1/cross-table.png', // Wrong table!
        storage: 's3',
      }),
    );

    const request = new Request('http://localhost/admin/profiles/1', {
      method: 'POST',
      body: formData,
    });
    const response = await handler(request);

    assertEquals(response.status, 200);
    const html = await response.text();
    assertStringIncludes(html, 'Invalid file reference');
  });

  await t.step(
    'update rejects file ref with wrong storage provider',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Storage Mismatch' });

      const handler = createHandlerWithStorage();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Valid key prefix but wrong storage provider
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Storage Tampering');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'valid-key.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/1/valid-uuid-prefix.png', // Valid key for record 1
          storage: 'malicious-provider', // Non-existent provider
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'Invalid storage provider');
    },
  );

  await t.step(
    'update rejects file ref with missing storage field when storage is configured',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Missing Storage' });

      const handler = createHandlerWithStorage();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Valid key prefix but storage field omitted entirely
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Storage Field Missing');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'sneaky.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/1/valid-uuid-prefix.png', // Valid key for record 1
          // storage field intentionally omitted to bypass validation
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'Invalid storage provider');
    },
  );

  await t.step(
    'update accepts valid file ref with correct key prefix',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Valid Update' });

      const handler = createHandlerWithStorage();
      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Valid key with correct prefix for record 1
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Valid Update');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'legitimate.png',
          contentType: 'image/png',
          size: 5678,
          key: 'profiles/avatar/1/abc123-legitimate.png', // Correct prefix!
          storage: 's3',
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      // Should succeed with redirect
      assertEquals(response.status, 303);

      // Verify the file reference was saved
      const [profile] = await db.select().from(profiles);
      const avatar = profile?.avatar as
        | { key?: string; storage?: string }
        | null;
      assertEquals(avatar?.key, 'profiles/avatar/1/abc123-legitimate.png');
      assertEquals(avatar?.storage, 's3');
    },
  );

  await t.step(
    'update accepts valid storage when resolveStorage routes to non-default',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Resolver Test' });

      // Create handler with resolveStorage that routes avatar column to 'archive'
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithFiles,
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
            },
          },
          {
            name: 'mock-archive',
            storageProvider: {
              id: 'archive',
              kind: 's3' as const,
              presignUpload: () =>
                Promise.resolve({
                  key: '',
                  upload: { method: 'PUT' as const, url: '' },
                }),
            },
          },
        ],
        // Route avatar column to 'archive', everything else to s3
        storage: (ctx) => ctx.column === 'avatar' ? 'archive' : 's3',
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Submit with 'archive' storage (matches resolver for avatar column)
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Resolver Test');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'resolved.png',
          contentType: 'image/png',
          size: 9999,
          key: 'profiles/avatar/1/resolved-key.png',
          storage: 'archive', // Matches resolveStorage result, not default!
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      // Should succeed - 'archive' matches resolver output for this column
      assertEquals(response.status, 303);

      const [profile] = await db.select().from(profiles);
      const avatar = profile?.avatar as
        | { key?: string; storage?: string }
        | null;
      assertEquals(avatar?.storage, 'archive');
    },
  );

  await t.step(
    'update rejects storage mismatch when resolveStorage routes elsewhere',
    async () => {
      await resetDb();
      await db.insert(profiles).values({ name: 'Resolver Mismatch' });

      // Same resolver: avatar -> 'archive'
      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithFiles,
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
            },
          },
          {
            name: 'mock-archive',
            storageProvider: {
              id: 'archive',
              kind: 's3' as const,
              presignUpload: () =>
                Promise.resolve({
                  key: '',
                  upload: { method: 'PUT' as const, url: '' },
                }),
            },
          },
        ],
        storage: (ctx) => ctx.column === 'avatar' ? 'archive' : 's3',
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const sourceToken = await generateSourceToken(
        SOURCE.CMS,
        TEST_CSRF_SECRET,
      );

      // Try to submit with 's3' but resolver routes avatar to 'archive'
      const formData = new FormData();
      formData.append('_csrf', csrfToken);
      formData.append('_source', sourceToken);
      formData.append('name', 'Resolver Mismatch');
      formData.append(
        'avatar',
        JSON.stringify({
          filename: 'wrong-storage.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/1/wrong-storage.png',
          storage: 's3', // Doesn't match resolver (should be 'archive')
        }),
      );

      const request = new Request('http://localhost/admin/profiles/1', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      // Should fail - 's3' doesn't match resolver's 'archive' for avatar
      assertEquals(response.status, 200);
      const html = await response.text();
      assertStringIncludes(html, 'Invalid storage provider');
    },
  );

  // ─────────────────────────────────────────────────────────────
  // Storage cleanup on record delete tests
  // ─────────────────────────────────────────────────────────────

  await t.step(
    'delete cleans up storage objects for file columns',
    async () => {
      await resetDb();

      // Track deleteObject calls
      const deletedKeys: string[] = [];

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithFiles,
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
              deleteObject: (ctx) => {
                deletedKeys.push(ctx.key);
                return Promise.resolve();
              },
            },
          },
        ],
        storage: 's3',
      });

      // Insert record with storage-backed file reference
      await db.insert(profiles).values({
        name: 'Profile with S3 file',
        avatar: {
          filename: 'avatar.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/1/uuid-avatar.png',
          storage: 's3',
        },
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const formData = new FormData();
      formData.append('_csrf', csrfToken);

      const request = new Request('http://localhost/admin/profiles/1/delete', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      assertEquals(response.status, 303);
      assertStringIncludes(
        response.headers.get('Location') ?? '',
        '_flash=delete_success',
      );

      // Verify storage object was deleted
      assertEquals(deletedKeys.length, 1);
      assertEquals(deletedKeys[0], 'profiles/avatar/1/uuid-avatar.png');

      // Verify DB record is gone
      const remaining = await db.select().from(profiles);
      assertEquals(remaining.length, 0);
    },
  );

  await t.step(
    'delete cleanup is fail-soft (storage error does not fail delete)',
    async () => {
      await resetDb();

      let errorLogged = false;

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithFiles,
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
              deleteObject: () => {
                throw new Error('S3 delete failed');
              },
            },
          },
        ],
        storage: 's3',
        onError: () => {
          errorLogged = true;
        },
      });

      // Insert record with storage-backed file
      await db.insert(profiles).values({
        name: 'Profile with failing cleanup',
        avatar: {
          filename: 'avatar.png',
          contentType: 'image/png',
          size: 1234,
          key: 'profiles/avatar/1/uuid-avatar.png',
          storage: 's3',
        },
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const formData = new FormData();
      formData.append('_csrf', csrfToken);

      const request = new Request('http://localhost/admin/profiles/1/delete', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      // Delete should succeed even though storage cleanup failed
      assertEquals(response.status, 303);
      assertStringIncludes(
        response.headers.get('Location') ?? '',
        '_flash=delete_success',
      );

      // Error should have been logged
      assertEquals(errorLogged, true);

      // DB record should be gone
      const remaining = await db.select().from(profiles);
      assertEquals(remaining.length, 0);
    },
  );

  await t.step(
    'delete does not cleanup storage for DB-inline files (no key)',
    async () => {
      await resetDb();

      const deletedKeys: string[] = [];

      const handler = createCmsHandler({
        csrfSecret: TEST_CSRF_SECRET,
        auth: 'dangerously-open',
        policies: 'dangerously-open',
        db,
        schema: schemaWithFiles,
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
              deleteObject: (ctx) => {
                deletedKeys.push(ctx.key);
                return Promise.resolve();
              },
            },
          },
        ],
        storage: 's3',
      });

      // Insert record with DB-inline file (has data, no key)
      await db.insert(profiles).values({
        name: 'Profile with inline file',
        avatar: {
          filename: 'avatar.png',
          contentType: 'image/png',
          size: 100,
          data: 'base64encodeddata',
        },
      });

      const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
      const formData = new FormData();
      formData.append('_csrf', csrfToken);

      const request = new Request('http://localhost/admin/profiles/1/delete', {
        method: 'POST',
        body: formData,
      });
      const response = await handler(request);

      assertEquals(response.status, 303);
      assertStringIncludes(
        response.headers.get('Location') ?? '',
        '_flash=delete_success',
      );

      // No storage cleanup for inline files
      assertEquals(deletedKeys.length, 0);
    },
  );

  await client.close();
});
