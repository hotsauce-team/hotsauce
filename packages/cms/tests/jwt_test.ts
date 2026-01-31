// Tests for JWT utilities
// Note: These tests verify the re-exports from @hotsauce/auth work correctly

import { assertEquals, assertNotEquals } from '@std/assert';
import { createJwtPayload, signJwt, verifyJwt } from '@hotsauce/auth';
import type { JwtPayload } from '@hotsauce/auth';

const TEST_SECRET = 'test-secret-must-be-at-least-32-characters-long';

// ============================================================================
// signJwt tests
// ============================================================================

Deno.test('signJwt: creates valid JWT format', async () => {
  const payload: JwtPayload = {
    sub: '123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const token = await signJwt(payload, TEST_SECRET);

  // JWT has 3 parts separated by dots
  const parts = token.split('.');
  assertEquals(parts.length, 3);
});

Deno.test('signJwt: requires secret of at least 32 chars', async () => {
  const payload = createJwtPayload('123');

  try {
    await signJwt(payload, 'short');
    throw new Error('Should have thrown');
  } catch (e) {
    assertEquals(
      (e as Error).message,
      'JWT secret must be at least 32 characters',
    );
  }
});

Deno.test('signJwt: produces unique tokens', async () => {
  const payload1 = createJwtPayload('123');
  const payload2 = createJwtPayload('456');

  const token1 = await signJwt(payload1, TEST_SECRET);
  const token2 = await signJwt(payload2, TEST_SECRET);

  assertNotEquals(token1, token2);
});

// ============================================================================
// verifyJwt tests
// ============================================================================

Deno.test('verifyJwt: verifies valid token', async () => {
  const payload: JwtPayload = {
    sub: '123',
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const token = await signJwt(payload, TEST_SECRET);
  const verified = await verifyJwt(token, TEST_SECRET);

  assertEquals(verified?.sub, '123');
  assertEquals(verified?.role, 'admin');
});

Deno.test('verifyJwt: returns null for invalid signature', async () => {
  const payload = createJwtPayload('123');
  const token = await signJwt(payload, TEST_SECRET);

  // Try with different secret
  const verified = await verifyJwt(
    token,
    'different-secret-that-is-32-chars-long',
  );

  assertEquals(verified, null);
});

Deno.test('verifyJwt: returns null for expired token', async () => {
  const payload: JwtPayload = {
    sub: '123',
    iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
  };

  const token = await signJwt(payload, TEST_SECRET);
  const verified = await verifyJwt(token, TEST_SECRET);

  assertEquals(verified, null);
});

Deno.test('verifyJwt: returns null for malformed token', async () => {
  const verified = await verifyJwt('not.a.valid.jwt', TEST_SECRET);
  assertEquals(verified, null);

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
