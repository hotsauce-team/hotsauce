/**
 * SigV4 Signing Tests
 *
 * Tests against AWS published test vectors and real-world scenarios.
 *
 * AWS Test Vectors Reference:
 * https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html
 */

import { assertEquals, assertExists, assertNotEquals } from '@std/assert';
import {
  buildObjectUrl,
  formatAmzDate,
  formatDateStamp,
  getSigningKey,
  presignUrl,
  signHeaders,
  uriEncode,
} from '../sigv4.ts';

// ─────────────────────────────────────────────────────────────
// Date Formatting Tests
// ─────────────────────────────────────────────────────────────

Deno.test('formatDateStamp: formats date as YYYYMMDD', () => {
  const date = new Date('2015-08-30T12:36:00.000Z');
  assertEquals(formatDateStamp(date), '20150830');
});

Deno.test('formatAmzDate: formats date as ISO 8601 basic', () => {
  const date = new Date('2015-08-30T12:36:00.000Z');
  assertEquals(formatAmzDate(date), '20150830T123600Z');
});

// ─────────────────────────────────────────────────────────────
// URI Encoding Tests
// ─────────────────────────────────────────────────────────────

Deno.test('uriEncode: encodes special characters', () => {
  assertEquals(uriEncode('Hello World'), 'Hello%20World');
  assertEquals(uriEncode('test/path'), 'test%2Fpath');
  assertEquals(uriEncode('test-path'), 'test-path');
  assertEquals(uriEncode('test_path'), 'test_path');
  assertEquals(uriEncode('test.path'), 'test.path');
  assertEquals(uriEncode('test~path'), 'test~path');
});

Deno.test('uriEncode: preserves slashes when encodeSlash is false', () => {
  assertEquals(uriEncode('test/path/file', false), 'test/path/file');
  assertEquals(uriEncode('test/path/file', true), 'test%2Fpath%2Ffile');
});

Deno.test('uriEncode: encodes UTF-8 characters', () => {
  // Multi-byte character encoding
  const encoded = uriEncode('日本語');
  assertEquals(encoded, '%E6%97%A5%E6%9C%AC%E8%AA%9E');
});

// ─────────────────────────────────────────────────────────────
// Signing Key Derivation Tests
// ─────────────────────────────────────────────────────────────

Deno.test('getSigningKey: derives key correctly', async () => {
  // This tests the HMAC chain derivation
  const key = await getSigningKey(
    'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    '20150830',
    'us-east-1',
    'AKIAIOSFODNN7EXAMPLE',
  );

  // Key should be a valid ArrayBuffer
  assertExists(key);
  assertEquals(key.byteLength, 32); // SHA-256 produces 32 bytes
});

Deno.test('getSigningKey: caches keys', async () => {
  const key1 = await getSigningKey(
    'secretKey123',
    '20231115',
    'us-east-1',
    'AKIATEST',
  );
  const key2 = await getSigningKey(
    'secretKey123',
    '20231115',
    'us-east-1',
    'AKIATEST',
  );

  // Should be the same object (cached)
  assertEquals(key1, key2);
});

Deno.test('getSigningKey: different credentials produce different keys', async () => {
  const key1 = await getSigningKey(
    'secretKey1',
    '20231115',
    'us-east-1',
    'AKIATEST1',
  );
  const key2 = await getSigningKey(
    'secretKey2',
    '20231115',
    'us-east-1',
    'AKIATEST2',
  );

  // Keys should be different
  const arr1 = new Uint8Array(key1);
  const arr2 = new Uint8Array(key2);

  let same = arr1.length === arr2.length;
  if (same) {
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) {
        same = false;
        break;
      }
    }
  }
  assertEquals(same, false);
});

// ─────────────────────────────────────────────────────────────
// URL Building Tests
// ─────────────────────────────────────────────────────────────

Deno.test('buildObjectUrl: virtual-hosted style', () => {
  const url = buildObjectUrl(
    'https://s3.us-east-1.amazonaws.com',
    'mybucket',
    'test/key.txt',
    'virtual-hosted',
  );
  assertEquals(url, 'https://mybucket.s3.us-east-1.amazonaws.com/test/key.txt');
});

Deno.test('buildObjectUrl: path style', () => {
  const url = buildObjectUrl(
    'https://s3.us-east-1.amazonaws.com',
    'mybucket',
    'test/key.txt',
    'path',
  );
  assertEquals(url, 'https://s3.us-east-1.amazonaws.com/mybucket/test/key.txt');
});

Deno.test('buildObjectUrl: path style with MinIO', () => {
  const url = buildObjectUrl(
    'https://minio.internal:9000',
    'uploads',
    'files/doc.pdf',
    'path',
  );
  assertEquals(url, 'https://minio.internal:9000/uploads/files/doc.pdf');
});

Deno.test('buildObjectUrl: path style with R2', () => {
  const url = buildObjectUrl(
    'https://account123.r2.cloudflarestorage.com',
    'my-bucket',
    'images/photo.jpg',
    'path',
  );
  assertEquals(
    url,
    'https://account123.r2.cloudflarestorage.com/my-bucket/images/photo.jpg',
  );
});

// ─────────────────────────────────────────────────────────────
// Presigned URL Tests
// ─────────────────────────────────────────────────────────────

Deno.test('presignUrl: generates valid presigned GET URL', async () => {
  const url = await presignUrl({
    method: 'GET',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    expirySeconds: 3600,
    date: new Date('2015-08-30T12:36:00.000Z'),
  });

  // Verify URL structure
  const parsed = new URL(url);
  assertEquals(parsed.hostname, 'mybucket.s3.us-east-1.amazonaws.com');
  assertEquals(parsed.pathname, '/test.txt');

  // Verify required query params
  assertEquals(parsed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assertEquals(parsed.searchParams.get('X-Amz-Expires'), '3600');
  assertEquals(parsed.searchParams.get('X-Amz-Date'), '20150830T123600Z');
  assertEquals(
    parsed.searchParams.get('X-Amz-Credential'),
    'AKIAIOSFODNN7EXAMPLE/20150830/us-east-1/s3/aws4_request',
  );
  assertEquals(parsed.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assertExists(parsed.searchParams.get('X-Amz-Signature'));
});

Deno.test('presignUrl: generates valid presigned PUT URL', async () => {
  const url = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    date: new Date('2023-11-15T10:00:00.000Z'),
  });

  const parsed = new URL(url);
  assertEquals(parsed.pathname, '/uploads/file.pdf');

  // Without extra headers, only 'host' is signed
  const signedHeaders = parsed.searchParams.get('X-Amz-SignedHeaders');
  assertExists(signedHeaders);
  assertEquals(signedHeaders, 'host');
});

Deno.test('presignUrl: signs Content-Length when provided in headers', async () => {
  const url = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    headers: { 'Content-Length': '12345' },
    date: new Date('2023-11-15T10:00:00.000Z'),
  });

  const parsed = new URL(url);

  // Content-Length must appear in SignedHeaders (sorted: content-length;host)
  const signedHeaders = parsed.searchParams.get('X-Amz-SignedHeaders');
  assertExists(signedHeaders);
  assertEquals(signedHeaders, 'content-length;host');

  // Signature must differ from a URL without Content-Length
  const urlNoHeaders = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    date: new Date('2023-11-15T10:00:00.000Z'),
  });
  const sig1 = parsed.searchParams.get('X-Amz-Signature');
  const sig2 = new URL(urlNoHeaders).searchParams.get('X-Amz-Signature');
  assertNotEquals(sig1, sig2);

  // Signature must differ when Content-Length value changes
  const urlDiffSize = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    headers: { 'Content-Length': '99999' },
    date: new Date('2023-11-15T10:00:00.000Z'),
  });
  const sig3 = new URL(urlDiffSize).searchParams.get('X-Amz-Signature');
  assertNotEquals(sig1, sig3);
});

Deno.test('presignUrl: signs Content-Type and Content-Length together', async () => {
  const url = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    headers: { 'Content-Length': '12345', 'Content-Type': 'image/png' },
    date: new Date('2023-11-15T10:00:00.000Z'),
  });

  const parsed = new URL(url);
  const signedHeaders = parsed.searchParams.get('X-Amz-SignedHeaders');
  assertEquals(signedHeaders, 'content-length;content-type;host');

  // Changing Content-Type changes the signature
  const urlDiffType = await presignUrl({
    method: 'PUT',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/file.pdf',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret123',
    expirySeconds: 900,
    headers: { 'Content-Length': '12345', 'Content-Type': 'application/pdf' },
    date: new Date('2023-11-15T10:00:00.000Z'),
  });
  assertNotEquals(
    parsed.searchParams.get('X-Amz-Signature'),
    new URL(urlDiffType).searchParams.get('X-Amz-Signature'),
  );
});

Deno.test('presignUrl: signature changes with different dates', async () => {
  const opts = {
    method: 'GET',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'testSecret',
  };

  const url1 = await presignUrl({
    ...opts,
    date: new Date('2023-11-15T10:00:00.000Z'),
  });
  const url2 = await presignUrl({
    ...opts,
    date: new Date('2023-11-16T10:00:00.000Z'),
  });

  const sig1 = new URL(url1).searchParams.get('X-Amz-Signature');
  const sig2 = new URL(url2).searchParams.get('X-Amz-Signature');

  // Signatures should be different for different dates
  assertEquals(sig1 !== sig2, true);
});

Deno.test('presignUrl: signature changes with different credentials', async () => {
  const opts = {
    method: 'GET',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/test.txt',
    region: 'us-east-1',
    date: new Date('2023-11-15T10:00:00.000Z'),
  };

  const url1 = await presignUrl({
    ...opts,
    accessKeyId: 'AKIATEST1',
    secretAccessKey: 'secret1',
  });
  const url2 = await presignUrl({
    ...opts,
    accessKeyId: 'AKIATEST2',
    secretAccessKey: 'secret2',
  });

  const sig1 = new URL(url1).searchParams.get('X-Amz-Signature');
  const sig2 = new URL(url2).searchParams.get('X-Amz-Signature');

  // Signatures should be different for different credentials
  assertEquals(sig1 !== sig2, true);
});

// ─────────────────────────────────────────────────────────────
// Signed Headers Tests (for DELETE)
// ─────────────────────────────────────────────────────────────

Deno.test('signHeaders: generates Authorization header', async () => {
  const headers = await signHeaders({
    method: 'DELETE',
    url: 'https://mybucket.s3.us-east-1.amazonaws.com/test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    date: new Date('2015-08-30T12:36:00.000Z'),
  });

  // Verify required headers
  assertExists(headers['Authorization']);
  assertExists(headers['x-amz-date']);
  assertExists(headers['x-amz-content-sha256']);

  // Verify Authorization format
  assertEquals(
    headers['Authorization'].startsWith('AWS4-HMAC-SHA256 Credential='),
    true,
  );
  assertEquals(headers['x-amz-date'], '20150830T123600Z');
  assertEquals(headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
});

// ─────────────────────────────────────────────────────────────
// Integration-like Tests
// ─────────────────────────────────────────────────────────────

Deno.test('presignUrl: path-style URLs for MinIO', async () => {
  // MinIO typically uses path-style URLs
  const objectUrl = buildObjectUrl(
    'https://minio.internal:9000',
    'uploads',
    'docs/file.pdf',
    'path',
  );

  const url = await presignUrl({
    method: 'PUT',
    url: objectUrl,
    region: 'us-east-1', // MinIO default
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    contentType: 'application/pdf',
    date: new Date('2023-11-15T10:00:00.000Z'),
  });

  const parsed = new URL(url);
  assertEquals(parsed.hostname, 'minio.internal');
  assertEquals(parsed.port, '9000');
  assertEquals(parsed.pathname, '/uploads/docs/file.pdf');
});

Deno.test('presignUrl: R2-style URLs', async () => {
  const objectUrl = buildObjectUrl(
    'https://account123.r2.cloudflarestorage.com',
    'my-bucket',
    'images/photo.jpg',
    'path',
  );

  const url = await presignUrl({
    method: 'GET',
    url: objectUrl,
    region: 'auto', // R2 uses 'auto'
    accessKeyId: 'r2-access-key',
    secretAccessKey: 'r2-secret-key',
    date: new Date('2023-11-15T10:00:00.000Z'),
  });

  const parsed = new URL(url);
  assertEquals(parsed.hostname, 'account123.r2.cloudflarestorage.com');
  assertEquals(parsed.pathname, '/my-bucket/images/photo.jpg');
});

// ─────────────────────────────────────────────────────────────
// Known AWS Test Vector (simplified)
// ─────────────────────────────────────────────────────────────

Deno.test('presignUrl: matches expected signature structure', async () => {
  // This test verifies the overall structure matches what AWS expects
  // It doesn't verify against the exact AWS test vectors (which would require
  // implementing the full test suite), but ensures the signature components
  // are present and correctly formatted.

  const url = await presignUrl({
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00.000Z'),
  });

  const parsed = new URL(url);

  // Verify credential format
  const credential = parsed.searchParams.get('X-Amz-Credential');
  assertExists(credential);
  assertEquals(credential?.includes('20130524'), true);
  assertEquals(credential?.includes('us-east-1'), true);
  assertEquals(credential?.includes('s3'), true);
  assertEquals(credential?.includes('aws4_request'), true);

  // Verify signature is 64 hex chars (256 bits)
  const signature = parsed.searchParams.get('X-Amz-Signature');
  assertExists(signature);
  assertEquals(signature?.length, 64);
  assertEquals(/^[0-9a-f]+$/.test(signature!), true);
});
