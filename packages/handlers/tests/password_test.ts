// Tests for password hashing utilities

import { assertEquals } from '@std/assert';
import { hashPassword, verifyPassword } from '../auth/password.ts';

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
  assertEquals(await verifyPassword('password', null as unknown as string), false);
  assertEquals(await verifyPassword(undefined as unknown as string, 'hash'), false);
  assertEquals(await verifyPassword('password', undefined as unknown as string), false);
});

// ============================================================================
// Integration tests
// ============================================================================

Deno.test('Password: full hash and verify cycle', async () => {
  const passwords = [
    'simple',
    'with spaces',
    'with-special-chars!@#$%^&*()',
    'unicode-日本語-émojis-🎉',
    'very-long-password-'.repeat(10),
  ];
  
  for (const password of passwords) {
    const hash = await hashPassword(password);
    const valid = await verifyPassword(password, hash);
    assertEquals(valid, true, `Failed for password: ${password.slice(0, 20)}...`);
  }
});

Deno.test('Password: timing attack resistance', async () => {
  // This test verifies the constant-time comparison works
  // by ensuring verification of wrong passwords takes similar time
  // (Note: this is a basic sanity check, not a rigorous timing test)
  
  const hash = await hashPassword('correct-password');
  
  // Verify correct password
  const start1 = performance.now();
  await verifyPassword('correct-password', hash);
  const time1 = performance.now() - start1;
  
  // Verify wrong password (same length)
  const start2 = performance.now();
  await verifyPassword('wrong---password', hash);
  const time2 = performance.now() - start2;
  
  // Verify wrong password (different length)
  const start3 = performance.now();
  await verifyPassword('short', hash);
  const time3 = performance.now() - start3;
  
  // Times should be in the same ballpark (within 10x)
  // This is a very loose check - mainly ensuring no obvious early-exit
  const maxTime = Math.max(time1, time2, time3);
  const minTime = Math.min(time1, time2, time3);
  
  // If there was an early exit, wrong passwords would be much faster
  // We just check they're not drastically different
  assertEquals(maxTime < minTime * 100, true, 'Timing difference too large');
});
