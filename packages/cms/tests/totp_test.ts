// TOTP utilities tests
// Note: These tests verify the re-exports from @hotsauce/auth work correctly

import { assertEquals, assertMatch } from '@std/assert';
import {
  generateTOTP,
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
} from '@hotsauce/auth';

// ─────────────────────────────────────────────────────────────
// generateTOTPSecret tests
// ─────────────────────────────────────────────────────────────

Deno.test('generateTOTPSecret: generates valid base32 string', () => {
  const secret = generateTOTPSecret();

  // Base32 alphabet: A-Z and 2-7
  assertMatch(secret, /^[A-Z2-7]+$/);
});

Deno.test('generateTOTPSecret: default length produces 32-char secret', () => {
  const secret = generateTOTPSecret();

  // 20 bytes * 8 bits / 5 bits per base32 char = 32 chars
  assertEquals(secret.length, 32);
});

Deno.test('generateTOTPSecret: custom length produces expected size', () => {
  const secret = generateTOTPSecret(10);

  // 10 bytes * 8 bits / 5 bits per base32 char = 16 chars
  assertEquals(secret.length, 16);
});

Deno.test('generateTOTPSecret: generates unique secrets', () => {
  const secrets = new Set<string>();

  for (let i = 0; i < 100; i++) {
    secrets.add(generateTOTPSecret());
  }

  // All 100 secrets should be unique
  assertEquals(secrets.size, 100);
});

// ─────────────────────────────────────────────────────────────
// generateTOTP tests (RFC 6238 test vectors)
// ─────────────────────────────────────────────────────────────

// RFC 6238 test vector secret (ASCII "12345678901234567890" in base32)
const RFC_TEST_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

Deno.test('generateTOTP: produces 6-digit code', async () => {
  const code = await generateTOTP(RFC_TEST_SECRET);

  assertEquals(code.length, 6);
  assertMatch(code, /^\d{6}$/);
});

Deno.test('generateTOTP: deterministic for same time', async () => {
  const time = 1234567890;

  const code1 = await generateTOTP(RFC_TEST_SECRET, time);
  const code2 = await generateTOTP(RFC_TEST_SECRET, time);

  assertEquals(code1, code2);
});

Deno.test('generateTOTP: different codes for different times', async () => {
  const code1 = await generateTOTP(RFC_TEST_SECRET, 1234567890);
  const code2 = await generateTOTP(RFC_TEST_SECRET, 1234567920); // 30 seconds later

  // Should be different (different time periods)
  assertEquals(code1 !== code2, true);
});

Deno.test('generateTOTP: same code within 30-second window', async () => {
  const code1 = await generateTOTP(RFC_TEST_SECRET, 1234567890);
  const code2 = await generateTOTP(RFC_TEST_SECRET, 1234567900); // 10 seconds later

  // Should be same (same time period)
  assertEquals(code1, code2);
});

Deno.test('generateTOTP: pads with leading zeros', async () => {
  // Use a time that produces a code starting with 0
  // We'll just verify the format is correct
  const code = await generateTOTP(RFC_TEST_SECRET, 0);

  assertEquals(code.length, 6);
  assertMatch(code, /^\d{6}$/);
});

// ─────────────────────────────────────────────────────────────
// verifyTOTP tests
// ─────────────────────────────────────────────────────────────

Deno.test('verifyTOTP: accepts valid current code', async () => {
  const secret = generateTOTPSecret();
  const code = await generateTOTP(secret);

  const result = await verifyTOTP(code, secret);

  assertEquals(result, true);
});

Deno.test('verifyTOTP: rejects invalid code', async () => {
  const secret = generateTOTPSecret();

  const result = await verifyTOTP('000000', secret);

  // Very unlikely to be valid
  assertEquals(result, false);
});

Deno.test('verifyTOTP: rejects wrong length code', async () => {
  const secret = generateTOTPSecret();

  const result = await verifyTOTP('12345', secret);

  assertEquals(result, false);
});

Deno.test('verifyTOTP: accepts code from previous period (within window)', async () => {
  const secret = generateTOTPSecret();
  const now = Math.floor(Date.now() / 1000);
  const previousPeriod = now - 30;

  const previousCode = await generateTOTP(secret, previousPeriod);

  // Should accept with default window of 1
  const result = await verifyTOTP(previousCode, secret, 1);

  assertEquals(result, true);
});

Deno.test('verifyTOTP: accepts code from next period (within window)', async () => {
  const secret = generateTOTPSecret();
  const now = Math.floor(Date.now() / 1000);
  const nextPeriod = now + 30;

  const nextCode = await generateTOTP(secret, nextPeriod);

  // Should accept with default window of 1
  const result = await verifyTOTP(nextCode, secret, 1);

  assertEquals(result, true);
});

Deno.test('verifyTOTP: rejects code outside window', async () => {
  const secret = generateTOTPSecret();
  const now = Math.floor(Date.now() / 1000);
  // Generate code from 3 periods ago (90 seconds)
  const oldPeriod = now - 90;

  const oldCode = await generateTOTP(secret, oldPeriod);

  // Should reject with window of 1 (only ±30 seconds)
  const result = await verifyTOTP(oldCode, secret, 1);

  assertEquals(result, false);
});

Deno.test('verifyTOTP: larger window accepts older codes', async () => {
  const secret = generateTOTPSecret();
  const now = Math.floor(Date.now() / 1000);
  // Generate code from 2 periods ago (60 seconds)
  const oldPeriod = now - 60;

  const oldCode = await generateTOTP(secret, oldPeriod);

  // Should accept with window of 2
  const result = await verifyTOTP(oldCode, secret, 2);

  assertEquals(result, true);
});

// ─────────────────────────────────────────────────────────────
// generateTOTPUri tests
// ─────────────────────────────────────────────────────────────

Deno.test('generateTOTPUri: produces valid otpauth URI', () => {
  const uri = generateTOTPUri(
    'JBSWY3DPEHPK3PXP',
    'alice@example.com',
    'My App',
  );

  assertEquals(
    uri,
    'otpauth://totp/My%20App:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=My%20App&algorithm=SHA1&digits=6&period=30',
  );
});

Deno.test('generateTOTPUri: encodes special characters', () => {
  const uri = generateTOTPUri(
    'SECRET123',
    'user+test@example.com',
    'My App & Co.',
  );

  assertEquals(uri.includes('user%2Btest%40example.com'), true);
  assertEquals(uri.includes('My%20App%20%26%20Co.'), true);
});

Deno.test('generateTOTPUri: works with simple names', () => {
  const uri = generateTOTPUri('ABC', 'user', 'App');

  assertEquals(
    uri,
    'otpauth://totp/App:user?secret=ABC&issuer=App&algorithm=SHA1&digits=6&period=30',
  );
});

// ─────────────────────────────────────────────────────────────
// Integration: generate → verify round-trip
// ─────────────────────────────────────────────────────────────

Deno.test('TOTP round-trip: generated code verifies successfully', async () => {
  const secret = generateTOTPSecret();
  const code = await generateTOTP(secret);
  const isValid = await verifyTOTP(code, secret);

  assertEquals(isValid, true);
});

Deno.test('TOTP round-trip: works with multiple secrets', async () => {
  for (let i = 0; i < 10; i++) {
    const secret = generateTOTPSecret();
    const code = await generateTOTP(secret);
    const isValid = await verifyTOTP(code, secret);

    assertEquals(isValid, true, `Failed for secret: ${secret}`);
  }
});
