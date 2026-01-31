// Tests for JWT utilities

import { assertEquals, assertExists } from '@std/assert';
import { createJwtPayload, signJwt, verifyJwt } from '../jwt.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

// ============================================================================
// signJwt tests
// ============================================================================

Deno.test('signJwt: creates a valid JWT token', async () => {
  const payload = { sub: '123', iat: 1000, exp: 2000 };
  const token = await signJwt(payload, TEST_SECRET);

  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  assertEquals(parts.length, 3);

  // Header should be base64url encoded JSON with alg: HS256
  const header = JSON.parse(
    atob(parts[0]!.replace(/-/g, '+').replace(/_/g, '/')),
  );
  assertEquals(header.alg, 'HS256');
  assertEquals(header.typ, 'JWT');
});

Deno.test('signJwt: payload is preserved in token', async () => {
  const payload = { sub: 'user-42', iat: 1234567890, exp: 1234571490 };
  const token = await signJwt(payload, TEST_SECRET);

  const parts = token.split('.');
  const decoded = JSON.parse(
    atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/')),
  );

  assertEquals(decoded.sub, 'user-42');
  assertEquals(decoded.iat, 1234567890);
  assertEquals(decoded.exp, 1234571490);
});

// ============================================================================
// verifyJwt tests
// ============================================================================

Deno.test('verifyJwt: verifies a valid token', async () => {
  const payload = {
    sub: '123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = await signJwt(payload, TEST_SECRET);

  const verified = await verifyJwt(token, TEST_SECRET);

  assertExists(verified);
  assertEquals(verified.sub, '123');
});

Deno.test('verifyJwt: returns null for wrong secret', async () => {
  const payload = {
    sub: '123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = await signJwt(payload, TEST_SECRET);

  const verified = await verifyJwt(token, 'wrong-secret-1234567890123456');
  assertEquals(verified, null);
});

Deno.test('verifyJwt: returns null for expired token', async () => {
  // Create a token that expired 1 hour ago
  const expiredPayload = {
    sub: '123',
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
  };
  const token = await signJwt(expiredPayload, TEST_SECRET);

  const verified = await verifyJwt(token, TEST_SECRET);
  assertEquals(verified, null);
});

Deno.test('verifyJwt: returns null for malformed token', async () => {
  const verified1 = await verifyJwt('not-a-jwt', TEST_SECRET);
  assertEquals(verified1, null);

  const verified2 = await verifyJwt('', TEST_SECRET);
  assertEquals(verified2, null);

  const verified3 = await verifyJwt('single-part', TEST_SECRET);
  assertEquals(verified3, null);
});

Deno.test('verifyJwt: returns null for tampered payload', async () => {
  const payload = createJwtPayload('123');
  const token = await signJwt(payload, TEST_SECRET);

  // Tamper with payload (change the middle part)
  const parts = token.split('.');
  parts[1] = btoa(JSON.stringify({ sub: '999', iat: 0, exp: 9999999999 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const tamperedToken = parts.join('.');

  const verified = await verifyJwt(tamperedToken, TEST_SECRET);
  assertEquals(verified, null);
});

Deno.test('verifyJwt: returns null for null/undefined inputs', async () => {
  assertEquals(await verifyJwt(null as unknown as string, TEST_SECRET), null);
  assertEquals(
    await verifyJwt(undefined as unknown as string, TEST_SECRET),
    null,
  );
  assertEquals(await verifyJwt('valid.token.here', ''), null);
});

// ============================================================================
// createJwtPayload tests
// ============================================================================

Deno.test('createJwtPayload: creates payload with defaults', () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = createJwtPayload('123');

  assertEquals(payload.sub, '123');
  assertEquals(payload.role, undefined);
  // iat should be close to now (within 2 seconds)
  assertEquals(payload.iat >= now - 2 && payload.iat <= now + 2, true);
  // exp should be 8 hours from iat
  assertEquals(payload.exp, payload.iat + 8 * 60 * 60);
});

Deno.test('createJwtPayload: includes identity and role when provided', () => {
  const payload = createJwtPayload('123', 'user@example.com', 'admin');

  assertEquals(payload.sub, '123');
  assertEquals(payload.identity, 'user@example.com');
  assertEquals(payload.role, 'admin');
});

Deno.test('createJwtPayload: uses custom maxAge', () => {
  const payload = createJwtPayload('123', undefined, undefined, 3600); // 1 hour

  assertEquals(payload.exp, payload.iat + 3600);
});

Deno.test('createJwtPayload: converts numeric id to string', () => {
  const payload = createJwtPayload(123);

  assertEquals(payload.sub, '123');
  assertEquals(typeof payload.sub, 'string');
});

// ============================================================================
// Integration tests
// ============================================================================

Deno.test('JWT: full sign and verify cycle', async () => {
  // Create payload
  const payload = createJwtPayload(
    'user-42',
    'user@example.com',
    'editor',
    3600,
  );

  // Sign
  const token = await signJwt(payload, TEST_SECRET);

  // Verify
  const verified = await verifyJwt(token, TEST_SECRET);

  assertEquals(verified?.sub, 'user-42');
  assertEquals(verified?.role, 'editor');
  assertEquals(verified?.iat, payload.iat);
  assertEquals(verified?.exp, payload.exp);
});
