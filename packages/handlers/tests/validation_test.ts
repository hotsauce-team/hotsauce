// Tests for CMS configuration validation

import { assertEquals, assertThrows } from '@std/assert';
import {
  CmsConfigError,
  CmsOptionsSchema,
  validateCmsOptions,
} from '../validation.ts';

// Mock minimal valid options
const validOptions = {
  db: { query: () => {} },
  schema: { users: { name: 'users' } },
  auth: 'dangerously-open' as const,
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
    () =>
      validateCmsOptions({
        schema: { users: {} },
        auth: 'dangerously-open',
      }),
    CmsConfigError,
    'db is required',
  );
});

Deno.test('validateCmsOptions: requires schema with tables', () => {
  assertThrows(
    () =>
      validateCmsOptions({
        db: {},
        schema: {},
        auth: 'dangerously-open',
      }),
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

Deno.test('validateCmsOptions: requires auth property', () => {
  const { auth: _, ...optionsWithoutAuth } = validOptions;
  assertThrows(
    () => validateCmsOptions(optionsWithoutAuth),
    CmsConfigError,
    'Invalid CMS configuration',
  );
});

Deno.test("validateCmsOptions: accepts auth: 'dangerously-open'", () => {
  // Should not throw
  validateCmsOptions({
    ...validOptions,
    auth: 'dangerously-open',
  });
});

Deno.test("validateCmsOptions: rejects policies when auth is 'dangerously-open'", () => {
  assertThrows(
    () =>
      validateCmsOptions({
        ...validOptions,
        auth: 'dangerously-open',
        policies: { users: () => undefined },
      }),
    CmsConfigError,
    'policies must not be set',
  );
});

Deno.test('validateCmsOptions: accepts auth config object with policies', () => {
  // Should not throw - policies required when auth is an object
  validateCmsOptions({
    ...validOptions,
    auth: {
      provider: { authenticate: () => {} },
    },
    policies: { users: () => undefined },
  });
});

Deno.test("validateCmsOptions: accepts auth config with policies: 'dangerously-open'", () => {
  // Should not throw
  validateCmsOptions({
    ...validOptions,
    auth: {
      provider: { authenticate: () => {} },
    },
    policies: 'dangerously-open',
  });
});

Deno.test('validateCmsOptions: requires policies when auth is config object', () => {
  assertThrows(
    () =>
      validateCmsOptions({
        ...validOptions,
        auth: {
          provider: { authenticate: () => {} },
        },
        // policies missing
      }),
    CmsConfigError,
    'policies',
  );
});

Deno.test('validateCmsOptions: accepts empty policies object (full access)', () => {
  // Empty policies {} is equivalent to 'dangerously-open' - full access to all tables
  validateCmsOptions({
    ...validOptions,
    auth: {
      provider: { authenticate: () => {} },
    },
    policies: {},
  });
});

Deno.test('validateCmsOptions: validates auth.provider is required', () => {
  assertThrows(
    () =>
      validateCmsOptions({
        ...validOptions,
        auth: {} as { provider: unknown },
        policies: 'dangerously-open',
      }),
    CmsConfigError,
    'auth.provider must be an AuthProvider',
  );
});

Deno.test('validateCmsOptions: validates auth.secret length', () => {
  assertThrows(
    () =>
      validateCmsOptions({
        ...validOptions,
        auth: {
          provider: { authenticate: () => {} },
          secret: 'short',
        },
        policies: 'dangerously-open',
      }),
    CmsConfigError,
    'at least 32 characters',
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
    assertEquals(
      (error as CmsConfigError).message.includes('Invalid CMS configuration'),
      true,
    );
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

// =============================================================================
// validateFileColumns tests
// =============================================================================

import { validateFileColumns } from '../validation.ts';

Deno.test('validateFileColumns: accepts file columns with json dataType', () => {
  const introspected = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'avatar', dataType: 'json', cmsOptions: { file: true } },
        ],
      },
    ],
  };
  // Should not throw
  validateFileColumns(introspected);
});

Deno.test('validateFileColumns: accepts tables without file columns', () => {
  const introspected = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'name', dataType: 'string' },
          { name: 'email', dataType: 'string' },
        ],
      },
    ],
  };
  // Should not throw
  validateFileColumns(introspected);
});

Deno.test('validateFileColumns: rejects file column with string dataType', () => {
  const introspected = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'avatar', dataType: 'string', cmsOptions: { file: true } },
        ],
      },
    ],
  };
  assertThrows(
    () => validateFileColumns(introspected),
    CmsConfigError,
    'users.avatar',
  );
});

Deno.test('validateFileColumns: rejects file column with number dataType', () => {
  const introspected = {
    tables: [
      {
        name: 'posts',
        columns: [
          { name: 'image', dataType: 'number', cmsOptions: { file: true } },
        ],
      },
    ],
  };
  assertThrows(
    () => validateFileColumns(introspected),
    CmsConfigError,
    'posts.image',
  );
});

Deno.test('validateFileColumns: reports multiple errors', () => {
  const introspected = {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'avatar', dataType: 'string', cmsOptions: { file: true } },
        ],
      },
      {
        name: 'posts',
        columns: [
          { name: 'image', dataType: 'string', cmsOptions: { file: true } },
        ],
      },
    ],
  };
  try {
    validateFileColumns(introspected);
  } catch (error) {
    const message = (error as CmsConfigError).message;
    assertEquals(message.includes('users.avatar'), true);
    assertEquals(message.includes('posts.image'), true);
  }
});
