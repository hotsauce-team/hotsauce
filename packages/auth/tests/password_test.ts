// Tests for password hashing utilities

import { assertEquals } from '@std/assert';
import { hashPassword, verifyPassword } from '../password.ts';

// ============================================================================
// hashPassword tests
// ============================================================================

Deno.test('hashPassword: creates hash in expected format', async () => {
  const hash = await hashPassword('test-password');

  // Should start with algorithm identifier
  assertEquals(hash.startsWith('$pbkdf2-sha256$'), true);

  // Should have 3 parts after prefix: iterations, salt, hash
  const parts = hash.slice('$pbkdf2-sha256$'.length).split('$');
  assertEquals(parts.length, 3);

  // Iterations should be a number
  const iterations = parseInt(parts[0] ?? '', 10);
  assertEquals(isNaN(iterations), false);
  assertEquals(iterations > 0, true);
});

Deno.test('hashPassword: produces unique hashes for same password', async () => {
  const hash1 = await hashPassword('same-password');
  const hash2 = await hashPassword('same-password');

  // Different salts = different hashes
  assertEquals(hash1 !== hash2, true);
});

Deno.test('hashPassword: throws on empty password', async () => {
  try {
    await hashPassword('');
    throw new Error('Should have thrown');
  } catch (e) {
    assertEquals((e as Error).message, 'Password is required');
  }
});

// ============================================================================
// verifyPassword tests
// ============================================================================

Deno.test('verifyPassword: verifies correct password', async () => {
  const password = 'my-secure-password';
  const hash = await hashPassword(password);

  const valid = await verifyPassword(password, hash);
  assertEquals(valid, true);
});

Deno.test('verifyPassword: rejects wrong password', async () => {
  const hash = await hashPassword('correct-password');

  const valid = await verifyPassword('wrong-password', hash);
  assertEquals(valid, false);
});

Deno.test('verifyPassword: rejects empty password', async () => {
  const hash = await hashPassword('some-password');

  const valid = await verifyPassword('', hash);
  assertEquals(valid, false);
});

Deno.test('verifyPassword: rejects empty hash', async () => {
  const valid = await verifyPassword('password', '');
  assertEquals(valid, false);
});

Deno.test('verifyPassword: rejects invalid hash format', async () => {
  const valid = await verifyPassword('password', 'not-a-valid-hash');
  assertEquals(valid, false);
});

Deno.test('verifyPassword: rejects hash with wrong prefix', async () => {
  const valid = await verifyPassword('password', '$bcrypt$somehash');
  assertEquals(valid, false);
});

Deno.test('verifyPassword: handles null/undefined safely', async () => {
  assertEquals(await verifyPassword(null as unknown as string, 'hash'), false);
  assertEquals(
    await verifyPassword('password', null as unknown as string),
    false,
  );
  assertEquals(
    await verifyPassword(undefined as unknown as string, 'hash'),
    false,
  );
  assertEquals(
    await verifyPassword('password', undefined as unknown as string),
    false,
  );
});

// ============================================================================
// Integration tests
// ============================================================================

Deno.test('password: hash and verify cycle', async () => {
  const passwords = [
    'simple',
    'with spaces and special !@#$%^&*()',
    '日本語パスワード',
    'a'.repeat(100), // long password
  ];

  for (const password of passwords) {
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    assertEquals(valid, true, `Failed for password: ${password}`);
  }
});

Deno.test('password: different passwords produce different hashes', async () => {
  const hash1 = await hashPassword('password1');
  const hash2 = await hashPassword('password2');

  assertEquals(hash1 !== hash2, true);
});
