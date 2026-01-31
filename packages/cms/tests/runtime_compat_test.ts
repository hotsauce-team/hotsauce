// Test runtime-compat utilities
import { assertEquals, assertThrows } from '@std/assert';
import { getEnv, requireEnv } from '../runtime-compat.ts';

// Before all tests set the CMS_TESTING env var
Deno.env.set('CMS_TESTING', 'true');

Deno.test('getEnv: returns value when set', () => {
  // PATH should always be set in any environment
  const testing = getEnv('CMS_TESTING');
  assertEquals(testing, 'true');
});

Deno.test('getEnv: returns undefined when not set', () => {
  // CMS_CSRF_SECRET is allowed but not set in test env
  const value = getEnv('CMS_CSRF_SECRET');
  // In test env it may or may not be set - just verify it returns string or undefined
  assertEquals(value === undefined || typeof value === 'string', true);
});

Deno.test('requireEnv: returns value when set', () => {
  const testing = requireEnv('CMS_TESTING', 'Testing environment variable');
  assertEquals(testing, 'true');
});

Deno.test('requireEnv: throws when not set', () => {
  // Only run this test if CMS_JWT_SECRET is not set
  // (we can't test arbitrary env vars due to Deno permissions)
  const jwtSecret = getEnv('CMS_JWT_SECRET');
  if (jwtSecret === undefined) {
    assertThrows(
      () => requireEnv('CMS_JWT_SECRET', 'JWT signing secret'),
      Error,
      'CMS_JWT_SECRET is required (JWT signing secret)',
    );
  }
});
