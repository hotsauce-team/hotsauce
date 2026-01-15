// Tests for CMS configuration validation

import { assertEquals, assertThrows } from '@std/assert';
import { validateCmsOptions, CmsConfigError, CmsOptionsSchema } from '../validation.ts';

// Mock minimal valid options
const validOptions = {
  db: { query: () => {} },
  schema: { users: { name: 'users' } },
};

Deno.test('validateCmsOptions: accepts valid config', () => {
  // Should not throw
  validateCmsOptions(validOptions);
});

Deno.test('validateCmsOptions: throws CmsConfigError on invalid config', () => {
  assertThrows(
    () => validateCmsOptions({}),
    CmsConfigError,
    'Invalid CMS configuration',
  );
});

Deno.test('validateCmsOptions: requires db', () => {
  assertThrows(
    () => validateCmsOptions({ schema: { users: {} } }),
    CmsConfigError,
    'db is required',
  );
});

Deno.test('validateCmsOptions: requires schema with tables', () => {
  assertThrows(
    () => validateCmsOptions({ db: {}, schema: {} }),
    CmsConfigError,
    'at least one table',
  );
});

Deno.test('validateCmsOptions: validates basePath starts with /', () => {
  assertThrows(
    () => validateCmsOptions({ ...validOptions, basePath: 'admin' }),
    CmsConfigError,
    'basePath must start with /',
  );
});

Deno.test('validateCmsOptions: validates csrfSecret length', () => {
  assertThrows(
    () => validateCmsOptions({ ...validOptions, csrfSecret: 'short' }),
    CmsConfigError,
    'at least 32 characters',
  );
});

Deno.test('validateCmsOptions: accepts valid csrfSecret', () => {
  // Should not throw
  validateCmsOptions({
    ...validOptions,
    csrfSecret: 'this-is-a-secret-that-is-at-least-32-characters-long',
  });
});

Deno.test('validateCmsOptions: handles Symbol keys in error paths', () => {
  // Drizzle tables have Symbol properties that Zod may include in error paths
  // This test ensures we don't crash when formatting error messages
  const symbolKey = Symbol('drizzle:test');
  const schemaWithSymbol = {
    users: { [symbolKey]: 'value' },
  };

  // This should throw CmsConfigError, not TypeError about Symbol conversion
  try {
    validateCmsOptions({
      db: null, // Invalid - will trigger error
      schema: schemaWithSymbol,
    });
  } catch (error) {
    // Should be CmsConfigError, not TypeError
    assertEquals(error instanceof CmsConfigError, true);
    assertEquals((error as CmsConfigError).message.includes('Invalid CMS configuration'), true);
  }
});

Deno.test('CmsOptionsSchema: parses valid options', () => {
  const result = CmsOptionsSchema.safeParse(validOptions);
  assertEquals(result.success, true);
});

Deno.test('CmsConfigError: includes ZodError details', () => {
  try {
    validateCmsOptions({});
  } catch (error) {
    const configError = error as CmsConfigError;
    assertEquals(configError.name, 'CmsConfigError');
    assertEquals(configError.details !== undefined, true);
  }
});
