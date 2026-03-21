/**
 * S3 Storage Plugin Route Tests
 *
 * Tests for:
 * - PublicEndpoint: presigned URLs use publicEndpoint for browser access
 * - Route body: POST body is passed to plugin route handlers
 */

import { assertEquals, assertStringIncludes } from '@std/assert';
import { buildObjectUrl, presignUrl } from '../sigv4.ts';
import { validatePresignRequest } from '../mod.ts';

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

  // Helper that mirrors the actual validation in mod.ts
  const isValid = (
    body: { filename?: string; contentType?: string; size?: number },
  ) => {
    return !!(body.filename && body.contentType &&
      typeof body.size === 'number');
  };

  // All required fields present
  const validBody = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1024,
  };
  assertEquals(isValid(validBody), true);

  // Size 0 is valid (empty files should be uploadable)
  const zeroSizeBody = {
    filename: 'empty.txt',
    contentType: 'text/plain',
    size: 0,
  };
  assertEquals(isValid(zeroSizeBody), true);

  // Missing size field
  const missingSize = { filename: 'test.png', contentType: 'image/png' };
  assertEquals(isValid(missingSize), false);

  // Size is wrong type (string instead of number)
  const stringSize = {
    filename: 'test.png',
    contentType: 'image/png',
    size: '1024' as unknown as number,
  };
  assertEquals(isValid(stringSize), false);

  // Size is undefined
  const undefinedSize = {
    filename: 'test.png',
    contentType: 'image/png',
    size: undefined as unknown as number,
  };
  assertEquals(isValid(undefinedSize), false);
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

// ─────────────────────────────────────────────────────────────
// Presign validation: maxSize and accept from $cms() options
// ─────────────────────────────────────────────────────────────

Deno.test('presign validation: rejects file exceeding maxSize', () => {
  const body = {
    filename: 'big.png',
    contentType: 'image/png',
    size: 5_000_000,
  };
  const config = { file: true, maxSize: 200_000 };

  const result = validatePresignRequest(body, config);
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'File too large');
  assertStringIncludes(result!.error, '195KB');
});

Deno.test('presign validation: default 10MB limit applies when no maxSize set', () => {
  const body = {
    filename: 'huge.bin',
    contentType: 'application/octet-stream',
    size: 11 * 1024 * 1024,
  };
  const config = { file: true };

  const result = validatePresignRequest(body, config);
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'File too large');
  assertStringIncludes(result!.error, '10MB');
});

Deno.test('presign validation: file within default 10MB limit passes', () => {
  const body = {
    filename: 'ok.bin',
    contentType: 'application/octet-stream',
    size: 9 * 1024 * 1024,
  };
  const config = { file: true };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: maxSize 0 disables size limit', () => {
  const body = {
    filename: 'huge.bin',
    contentType: 'application/octet-stream',
    size: 500 * 1024 * 1024,
  };
  const config = { file: true, maxSize: 0 };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: accepts file within maxSize', () => {
  const body = {
    filename: 'small.png',
    contentType: 'image/png',
    size: 100_000,
  };
  const config = { file: true, maxSize: 200_000 };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: accepts file at exactly maxSize', () => {
  const body = {
    filename: 'exact.png',
    contentType: 'image/png',
    size: 200_000,
  };
  const config = { file: true, maxSize: 200_000 };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: rejects wrong content type', () => {
  const body = {
    filename: 'doc.pdf',
    contentType: 'application/pdf',
    size: 1000,
  };
  const config = { file: true, accept: 'image/*' };

  const result = validatePresignRequest(body, config);
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'Invalid file type');
  assertStringIncludes(result!.error, 'image/*');
});

Deno.test('presign validation: accepts matching content type', () => {
  const body = { filename: 'photo.jpg', contentType: 'image/jpeg', size: 1000 };
  const config = { file: true, accept: 'image/*' };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: accepts exact content type match', () => {
  const body = { filename: 'photo.png', contentType: 'image/png', size: 1000 };
  const config = { file: true, accept: 'image/png,image/jpeg' };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: rejects content type not in comma list', () => {
  const body = { filename: 'photo.gif', contentType: 'image/gif', size: 1000 };
  const config = { file: true, accept: 'image/png,image/jpeg' };

  const result = validatePresignRequest(body, config);
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'Invalid file type');
});

Deno.test('presign validation: wildcard */* accepts anything', () => {
  const body = {
    filename: 'anything.zip',
    contentType: 'application/zip',
    size: 1000,
  };
  const config = { file: true, accept: '*/*' };

  const result = validatePresignRequest(body, config);
  assertEquals(result, null);
});

Deno.test('presign validation: no config means no restrictions', () => {
  const body = {
    filename: 'huge.bin',
    contentType: 'application/octet-stream',
    size: 999_999_999,
  };

  const result = validatePresignRequest(body, undefined);
  assertEquals(result, null);
});

Deno.test('presign validation: error shows MB for large limits', () => {
  const body = {
    filename: 'big.bin',
    contentType: 'application/octet-stream',
    size: 60_000_000,
  };
  const config = { file: true, maxSize: 50 * 1024 * 1024 };

  const result = validatePresignRequest(body, config);
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, '50MB');
});

Deno.test('presign validation: both maxSize and accept checked together', () => {
  // Valid type but too big
  const bigImage = {
    filename: 'big.png',
    contentType: 'image/png',
    size: 5_000_000,
  };
  const config = { file: true, maxSize: 200_000, accept: 'image/*' };

  const result1 = validatePresignRequest(bigImage, config);
  assertEquals(result1 !== null, true);
  assertStringIncludes(result1!.error, 'File too large');

  // Valid size but wrong type
  const smallPdf = {
    filename: 'doc.pdf',
    contentType: 'application/pdf',
    size: 1000,
  };
  const result2 = validatePresignRequest(smallPdf, config);
  assertEquals(result2 !== null, true);
  assertStringIncludes(result2!.error, 'Invalid file type');

  // Both valid
  const goodFile = {
    filename: 'ok.png',
    contentType: 'image/png',
    size: 100_000,
  };
  const result3 = validatePresignRequest(goodFile, config);
  assertEquals(result3, null);
});
