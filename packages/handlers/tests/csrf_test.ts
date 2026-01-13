// CSRF utilities tests

import { assertEquals, assertNotEquals } from 'jsr:@std/assert';
import {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfTokenFromFormData,
  getCsrfFieldName,
} from '../csrf.ts';

Deno.test('getCsrfFieldName: returns _csrf', () => {
  assertEquals(getCsrfFieldName(), '_csrf');
});

Deno.test('generateCsrfToken: returns non-empty string', () => {
  const token = generateCsrfToken();
  assertEquals(typeof token, 'string');
  assertNotEquals(token.length, 0);
});

Deno.test('generateCsrfToken: returns unique tokens', () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 10; i++) {
    tokens.add(generateCsrfToken());
  }
  assertEquals(tokens.size, 10, 'Expected 10 unique tokens');
});

Deno.test('generateCsrfToken: format is timestamp.random.signature', () => {
  const token = generateCsrfToken();
  const parts = token.split('.');
  assertEquals(parts.length, 3, 'Token should have 3 parts');
  
  // First part should be a valid base36 timestamp
  const timestamp = parseInt(parts[0]!, 36);
  assertEquals(isNaN(timestamp), false, 'First part should be a base36 number');
  // Should be a reasonable timestamp (after year 2020)
  assertEquals(timestamp > 1577836800000, true, 'Timestamp should be after 2020');
});

Deno.test('validateCsrfToken: validates correct token', () => {
  const token = generateCsrfToken();
  assertEquals(validateCsrfToken(token), true);
});

Deno.test('validateCsrfToken: rejects empty string', () => {
  assertEquals(validateCsrfToken(''), false);
});

Deno.test('validateCsrfToken: rejects null', () => {
  assertEquals(validateCsrfToken(null), false);
});

Deno.test('validateCsrfToken: rejects undefined', () => {
  assertEquals(validateCsrfToken(undefined as unknown as string), false);
});

Deno.test('validateCsrfToken: rejects tampered token', () => {
  const token = generateCsrfToken();
  const parts = token.split('.');
  // Tamper with the random part
  parts[1] = 'tampered';
  const tamperedToken = parts.join('.');
  assertEquals(validateCsrfToken(tamperedToken), false);
});

Deno.test('validateCsrfToken: rejects malformed token (wrong parts)', () => {
  assertEquals(validateCsrfToken('only.two'), false);
  assertEquals(validateCsrfToken('single'), false);
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

Deno.test('integration: generate and validate token flow', () => {
  // Simulate form flow
  const token = generateCsrfToken();
  
  // Simulate receiving token in form submission
  const formData: Record<string, string | string[]> = {
    '_csrf': token,
    'name': 'Test User',
  };
  
  // Extract and validate
  const receivedToken = getCsrfTokenFromFormData(formData);
  assertEquals(validateCsrfToken(receivedToken), true);
});
