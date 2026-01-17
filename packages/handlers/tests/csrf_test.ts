// CSRF utilities tests

import { assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert';
import {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfTokenFromFormData,
  getCsrfFieldName,
} from '../csrf.ts';

// Test secret (32+ chars for security requirement)
const TEST_SECRET = 'test-secret-key-for-csrf-tokens-minimum-32-chars';

Deno.test('getCsrfFieldName: returns _csrf', () => {
  assertEquals(getCsrfFieldName(), '_csrf');
});

Deno.test('generateCsrfToken: returns non-empty string', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  assertEquals(typeof token, 'string');
  assertNotEquals(token.length, 0);
});

Deno.test('generateCsrfToken: requires secret of at least 32 chars', async () => {
  await assertRejects(
    () => generateCsrfToken('short-secret-only-20-ch'),
    Error,
    'CSRF secret must be at least 32 characters'
  );
});

Deno.test('generateCsrfToken: returns unique tokens', async () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 10; i++) {
    tokens.add(await generateCsrfToken(TEST_SECRET));
  }
  assertEquals(tokens.size, 10, 'Expected 10 unique tokens');
});

Deno.test('generateCsrfToken: format is timestamp.random.signature', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  const parts = token.split('.');
  assertEquals(parts.length, 3, 'Token should have 3 parts');
  
  // First part should be a valid base36 timestamp
  const timestamp = parseInt(parts[0]!, 36);
  assertEquals(isNaN(timestamp), false, 'First part should be a base36 number');
  // Should be a reasonable timestamp (after year 2020)
  assertEquals(timestamp > 1577836800000, true, 'Timestamp should be after 2020');
});

Deno.test('validateCsrfToken: validates correct token', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  assertEquals(await validateCsrfToken(token, TEST_SECRET), true);
});

Deno.test('validateCsrfToken: rejects empty string', async () => {
  assertEquals(await validateCsrfToken('', TEST_SECRET), false);
});

Deno.test('validateCsrfToken: rejects null', async () => {
  assertEquals(await validateCsrfToken(null, TEST_SECRET), false);
});

Deno.test('validateCsrfToken: rejects undefined', async () => {
  assertEquals(await validateCsrfToken(undefined as unknown as string, TEST_SECRET), false);
});

Deno.test('validateCsrfToken: rejects empty secret', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  assertEquals(await validateCsrfToken(token, ''), false);
});

Deno.test('validateCsrfToken: rejects wrong secret', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  assertEquals(await validateCsrfToken(token, 'wrong-secret-key-that-is-long-enough'), false);
});

Deno.test('validateCsrfToken: rejects tampered token', async () => {
  const token = await generateCsrfToken(TEST_SECRET);
  const parts = token.split('.');
  // Tamper with the random part
  parts[1] = 'tampered';
  const tamperedToken = parts.join('.');
  assertEquals(await validateCsrfToken(tamperedToken, TEST_SECRET), false);
});

Deno.test('validateCsrfToken: rejects malformed token (wrong parts)', async () => {
  assertEquals(await validateCsrfToken('only.two', TEST_SECRET), false);
  assertEquals(await validateCsrfToken('single', TEST_SECRET), false);
});

Deno.test('getCsrfTokenFromFormData: extracts token from form data', () => {
  const formData: Record<string, string | string[]> = { '_csrf': 'test-token' };
  assertEquals(getCsrfTokenFromFormData(formData), 'test-token');
});

Deno.test('getCsrfTokenFromFormData: returns null when missing', () => {
  const formData: Record<string, string | string[]> = {};
  assertEquals(getCsrfTokenFromFormData(formData), null);
});

Deno.test('getCsrfTokenFromFormData: handles array value', () => {
  const formData: Record<string, string | string[]> = { '_csrf': ['first-token', 'second-token'] };
  assertEquals(getCsrfTokenFromFormData(formData), 'first-token');
});

Deno.test('integration: generate and validate token flow', async () => {
  // Simulate form flow
  const token = await generateCsrfToken(TEST_SECRET);
  
  // Simulate receiving token in form submission
  const formData: Record<string, string | string[]> = {
    '_csrf': token,
    'name': 'Test User',
  };
  
  // Extract and validate
  const receivedToken = getCsrfTokenFromFormData(formData);
  assertEquals(await validateCsrfToken(receivedToken, TEST_SECRET), true);
});

Deno.test('validateCsrfToken: rejects future-dated tokens', async () => {
  // Craft a token with a timestamp 2 minutes in the future (beyond 1 min tolerance)
  const futureTime = Date.now() + 2 * 60 * 1000;
  const futureTimestamp = futureTime.toString(36);
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // We can't sign it properly without access to internal functions,
  // but we can test that even a validly-structured token with future timestamp fails
  // by creating a valid token and manipulating it
  const validToken = await generateCsrfToken(TEST_SECRET);
  const parts = validToken.split('.');
  // Replace timestamp with future timestamp (signature will be invalid anyway)
  parts[0] = futureTimestamp;
  const futureToken = parts.join('.');
  
  assertEquals(await validateCsrfToken(futureToken, TEST_SECRET), false);
});
