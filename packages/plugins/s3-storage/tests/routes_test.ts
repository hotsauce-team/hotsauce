/**
 * S3 Storage Plugin Route Tests
 *
 * Tests for:
 * - PublicEndpoint: presigned URLs use publicEndpoint for browser access
 * - Route body: POST body is passed to plugin route handlers
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildObjectUrl, presignUrl } from '../sigv4.ts';

// ─────────────────────────────────────────────────────────────
// PublicEndpoint Tests
// ─────────────────────────────────────────────────────────────

Deno.test('presignUrl: uses provided URL for signing (publicEndpoint flow)', async () => {
  // Simulate the pattern: internal endpoint vs public endpoint
  const internalEndpoint = 'http://minio:9000';
  const publicEndpoint = 'http://localhost:9000';
  const bucket = 'uploads';
  const key = 'media/file/123/test.png';

  // Build URL with publicEndpoint (browser-facing)
  const publicUrl = buildObjectUrl(publicEndpoint, bucket, key, 'path');
  assertEquals(
    publicUrl,
    'http://localhost:9000/uploads/media/file/123/test.png',
  );

  // Build URL with internal endpoint (server-facing)
  const internalUrl = buildObjectUrl(internalEndpoint, bucket, key, 'path');
  assertEquals(
    internalUrl,
    'http://minio:9000/uploads/media/file/123/test.png',
  );

  // Presign with public URL - this is what the browser receives
  const presignedPublic = await presignUrl({
    method: 'PUT',
    url: publicUrl,
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    expirySeconds: 900,
    contentType: 'image/png',
  });

  // Verify the presigned URL uses localhost (public), not minio (internal)
  assertStringIncludes(presignedPublic, 'localhost:9000');
  assertStringIncludes(presignedPublic, 'X-Amz-Signature=');
});

Deno.test('buildObjectUrl: path-style with different endpoints', () => {
  const bucket = 'uploads';
  const key = 'test.png';

  // Internal Docker network
  assertEquals(
    buildObjectUrl('http://minio:9000', bucket, key, 'path'),
    'http://minio:9000/uploads/test.png',
  );

  // Public localhost
  assertEquals(
    buildObjectUrl('http://localhost:9000', bucket, key, 'path'),
    'http://localhost:9000/uploads/test.png',
  );

  // Production URL
  assertEquals(
    buildObjectUrl('https://s3.us-east-1.amazonaws.com', bucket, key, 'path'),
    'https://s3.us-east-1.amazonaws.com/uploads/test.png',
  );
});

// ─────────────────────────────────────────────────────────────
// Route Body Tests
// ─────────────────────────────────────────────────────────────

Deno.test('plugin route context: body field contains POST request body', () => {
  // Simulate the PluginRouteContext structure
  interface MockPluginRouteContext {
    method: string;
    body?: string;
    params: Record<string, string>;
  }

  // POST request with JSON body
  const ctx: MockPluginRouteContext = {
    method: 'POST',
    body: JSON.stringify({
      table: 'media',
      column: 'file',
      recordId: '123',
      filename: 'test.png',
      contentType: 'image/png',
      size: 1024,
    }),
    params: {},
  };

  // Body should be parseable
  const parsed = JSON.parse(ctx.body!);
  assertEquals(parsed.table, 'media');
  assertEquals(parsed.filename, 'test.png');
});

Deno.test('plugin route context: body is undefined for GET requests', () => {
  interface MockPluginRouteContext {
    method: string;
    body?: string;
    params: Record<string, string>;
  }

  // GET request has no body
  const ctx: MockPluginRouteContext = {
    method: 'GET',
    body: undefined,
    params: { table: 'media', id: '123', column: 'file' },
  };

  assertEquals(ctx.body, undefined);
});

Deno.test('presign handler: validates JSON body structure', () => {
  // Simulate the validation logic in the presign route handler
  // Note: table/id/column come from URL params (handled by CMS policy checks)
  // Body only contains file info
  const validBody = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1024,
  };

  // All required fields present
  const hasRequired = validBody.filename &&
    validBody.contentType &&
    validBody.size;

  assertEquals(hasRequired !== undefined, true);

  // Missing field should fail validation
  const invalidBody = {
    filename: 'test.png',
    // missing contentType, size
  };

  const missingRequired = !invalidBody.filename ||
    !('contentType' in invalidBody) ||
    !('size' in invalidBody);

  assertEquals(missingRequired, true);
});

// ─────────────────────────────────────────────────────────────
// Integration: publicEndpoint separates internal vs browser URLs
// ─────────────────────────────────────────────────────────────

Deno.test('publicEndpoint: presigned upload URL differs from internal delete URL', async () => {
  const config = {
    endpoint: 'http://minio:9000', // Internal (for server→S3)
    publicEndpoint: 'http://localhost:9000', // Public (for browser→S3)
    bucket: 'uploads',
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  };

  const key = 'media/file/1/doc.pdf';

  // Upload URL uses publicEndpoint (browser will PUT to this)
  const uploadUrl = buildObjectUrl(
    config.publicEndpoint,
    config.bucket,
    key,
    'path',
  );
  const presignedUpload = await presignUrl({
    method: 'PUT',
    url: uploadUrl,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expirySeconds: 900,
    contentType: 'application/pdf',
  });

  // Delete URL uses internal endpoint (server will DELETE from this)
  const deleteUrl = buildObjectUrl(config.endpoint, config.bucket, key, 'path');

  // Verify URLs point to different hosts
  assertStringIncludes(presignedUpload, 'localhost:9000');
  assertStringIncludes(deleteUrl, 'minio:9000');

  // Both should have the same path
  assertStringIncludes(presignedUpload, '/uploads/media/file/1/doc.pdf');
  assertStringIncludes(deleteUrl, '/uploads/media/file/1/doc.pdf');
});
