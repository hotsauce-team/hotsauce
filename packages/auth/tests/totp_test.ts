// Tests for TOTP utilities (RFC 6238)

import { assertEquals } from '@std/assert';
import {
  generateTOTP,
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
} from '../totp.ts';

// RFC 6238 test vectors for SHA1
// Time: 59 seconds (step 1), Secret: "12345678901234567890" (base32: GEZDGNBVGY3TQOJQ)
// Expected: 287082

// ─────────────────────────────────────────────────────────────
// generateTOTPSecret tests
// ─────────────────────────────────────────────────────────────

Deno.test('generateTOTPSecret: generates a valid base32 secret', () => {
  const secret = generateTOTPSecret();

  // Should be 32 characters (160 bits / 5 bits per char)
  assertEquals(secret.length, 32);

  // Should only contain valid base32 characters (no padding)
  const base32Regex = /^[A-Z2-7]+$/;
  assertEquals(base32Regex.test(secret), true);
});

Deno.test('generateTOTPSecret: generates unique secrets', () => {
  const secrets = new Set<string>();
  for (let i = 0; i < 100; i++) {
    secrets.add(generateTOTPSecret());
  }
  // All should be unique
  assertEquals(secrets.size, 100);
});

// ─────────────────────────────────────────────────────────────
// generateTOTP tests
// ─────────────────────────────────────────────────────────────

Deno.test('generateTOTP: generates a 6-digit code', async () => {
  const secret = generateTOTPSecret();
  const code = await generateTOTP(secret);

  // Should be exactly 6 digits
  assertEquals(code.length, 6);
  assertEquals(/^\d{6}$/.test(code), true);
});

Deno.test('generateTOTP: same secret and time produces same code', async () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const time = 1234567890;

  const code1 = await generateTOTP(secret, time);
  const code2 = await generateTOTP(secret, time);

  assertEquals(code1, code2);
});

Deno.test('generateTOTP: different times produce different codes', async () => {
  const secret = generateTOTPSecret();
  const time1 = 1234567890;
  const time2 = 1234567890 + 30; // Next period

  const code1 = await generateTOTP(secret, time1);
  const code2 = await generateTOTP(secret, time2);

  assertEquals(code1 !== code2, true);
});

Deno.test('generateTOTP: RFC test vector at t=59', async () => {
  // RFC 6238 test case
  // Secret: "12345678901234567890" = base32 "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const time = 59;

  const code = await generateTOTP(secret, time);

  assertEquals(code, '287082');
});

Deno.test('generateTOTP: RFC test vector at t=1111111109', async () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const time = 1111111109;

  const code = await generateTOTP(secret, time);

  assertEquals(code, '081804');
});

// ─────────────────────────────────────────────────────────────
// verifyTOTP tests
// ─────────────────────────────────────────────────────────────

Deno.test('verifyTOTP: accepts current valid code', async () => {
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
