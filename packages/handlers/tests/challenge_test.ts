// Challenge token tests
// Note: These tests verify the re-exports from @drizzle-cms/auth work correctly
import { assertEquals, assertExists } from '@std/assert';
import { createChallengeToken, verifyChallengeToken } from '@drizzle-cms/auth';

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
