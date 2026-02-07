// Challenge token tests
import { assertEquals, assertExists, assertRejects } from '@std/assert';
import {
  createChallengeToken,
  decryptTokenData,
  encryptTokenData,
  verifyChallengeToken,
} from '../challenge.ts';

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

Deno.test('createChallengeToken: creates a token', async () => {
  const token = await createChallengeToken(123, TEST_SECRET);
  assertExists(token);
  assertEquals(typeof token, 'string');
  // Token should be base64 encoded
  assertEquals(token.match(/^[A-Za-z0-9+/=]+$/)?.[0], token);
});

Deno.test('verifyChallengeToken: verifies a valid token', async () => {
  const token = await createChallengeToken(456, TEST_SECRET);
  const userId = await verifyChallengeToken(token, TEST_SECRET);
  assertEquals(userId, 456);
});

Deno.test('verifyChallengeToken: handles string user IDs', async () => {
  const token = await createChallengeToken('user-abc-123', TEST_SECRET);
  const userId = await verifyChallengeToken(token, TEST_SECRET);
  assertEquals(userId, 'user-abc-123');
});

Deno.test('verifyChallengeToken: returns null for invalid token', async () => {
  const result = await verifyChallengeToken('invalid-token', TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('verifyChallengeToken: returns null for empty token', async () => {
  const result = await verifyChallengeToken('', TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('verifyChallengeToken: returns null for wrong secret', async () => {
  const token = await createChallengeToken(123, TEST_SECRET);
  const result = await verifyChallengeToken(
    token,
    'wrong-secret-1234567890123456',
  );
  assertEquals(result, null);
});

Deno.test('verifyChallengeToken: returns null for tampered token', async () => {
  const token = await createChallengeToken(123, TEST_SECRET);
  // Tamper with the token by changing a character
  const tampered = token.slice(0, -5) + 'XXXXX';
  const result = await verifyChallengeToken(tampered, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('verifyChallengeToken: returns null for malformed token', async () => {
  // Create a token missing parts
  const malformed = btoa('123|only-two-parts');
  const result = await verifyChallengeToken(malformed, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('verifyChallengeToken: returns null for expired token', async () => {
  // Create a token with past expiration manually
  const expiredPayload = `123|${Date.now() - 1000}|fake-signature`;
  const expiredToken = btoa(expiredPayload);
  const result = await verifyChallengeToken(expiredToken, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('createChallengeToken: different users get different tokens', async () => {
  const token1 = await createChallengeToken(1, TEST_SECRET);
  const token2 = await createChallengeToken(2, TEST_SECRET);
  // Tokens should be different
  assertEquals(token1 !== token2, true);
});

// ─────────────────────────────────────────────────────────────
// Secret length validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('createChallengeToken: throws for weak secret', async () => {
  await assertRejects(
    async () => await createChallengeToken(123, 'short'),
    Error,
    'at least 32 characters',
  );
});

Deno.test('createChallengeToken: throws for empty secret', async () => {
  await assertRejects(
    async () => await createChallengeToken(123, ''),
    Error,
    'at least 32 characters',
  );
});

Deno.test('verifyChallengeToken: returns null for weak secret', async () => {
  const token = await createChallengeToken(123, TEST_SECRET);
  // Even with valid token, weak secret at verify time returns null
  const result = await verifyChallengeToken(token, 'short');
  assertEquals(result, null);
});

// ─────────────────────────────────────────────────────────────
// Encryption tests
// ─────────────────────────────────────────────────────────────

Deno.test('encryptTokenData: encrypts and decrypts data', async () => {
  const plaintext = 'TOTP-SECRET-ABC123';
  const encrypted = await encryptTokenData(plaintext, TEST_SECRET);
  const decrypted = await decryptTokenData(encrypted, TEST_SECRET);
  assertEquals(decrypted, plaintext);
});

Deno.test('encryptTokenData: produces different ciphertext each time', async () => {
  const plaintext = 'same-data';
  const encrypted1 = await encryptTokenData(plaintext, TEST_SECRET);
  const encrypted2 = await encryptTokenData(plaintext, TEST_SECRET);
  // Should produce different ciphertexts due to random IV
  assertEquals(encrypted1 !== encrypted2, true);
  // But both should decrypt to the same value
  assertEquals(await decryptTokenData(encrypted1, TEST_SECRET), plaintext);
  assertEquals(await decryptTokenData(encrypted2, TEST_SECRET), plaintext);
});

Deno.test('encryptTokenData: throws for weak secret', async () => {
  await assertRejects(
    async () => await encryptTokenData('data', 'short'),
    Error,
    'at least 32 characters',
  );
});

Deno.test('decryptTokenData: returns null for weak secret', async () => {
  const encrypted = await encryptTokenData('data', TEST_SECRET);
  const result = await decryptTokenData(encrypted, 'short');
  assertEquals(result, null);
});

Deno.test('decryptTokenData: returns null for wrong secret', async () => {
  const encrypted = await encryptTokenData('data', TEST_SECRET);
  const result = await decryptTokenData(
    encrypted,
    'different-secret-at-least-32-chars',
  );
  assertEquals(result, null);
});

Deno.test('decryptTokenData: returns null for tampered data', async () => {
  const encrypted = await encryptTokenData('data', TEST_SECRET);
  const tampered = encrypted.slice(0, -5) + 'XXXXX';
  const result = await decryptTokenData(tampered, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('decryptTokenData: returns null for invalid base64', async () => {
  const result = await decryptTokenData('not-valid-base64!!!', TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('decryptTokenData: returns null for too-short data', async () => {
  const result = await decryptTokenData(btoa('short'), TEST_SECRET);
  assertEquals(result, null);
});
