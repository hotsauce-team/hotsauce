// Tests for Zod-based form validation in handlers

import { assertEquals, assertExists } from '@std/assert';
import { formatZodErrors, validateFormData } from '../crud-helpers.ts';
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { z } from 'zod';

// Test table schema
const testUsers = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  age: integer('age'),
  active: boolean('active').default(true),
});

// ============================================================================
// validateFormData tests
// ============================================================================

Deno.test('validateFormData: valid data passes', () => {
  const values = {
    name: 'John Doe',
    email: 'john@example.com',
    age: 25,
    active: true,
  };

  const result = validateFormData(testUsers, values);

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, 'John Doe');
  assertEquals(result.errors, undefined);
});

Deno.test('validateFormData: missing required field fails', () => {
  const values = {
    email: 'john@example.com',
    // name is missing
  };

  const result = validateFormData(testUsers, values);

  assertEquals(result.success, false);
  assertExists(result.errors);
  assertExists(result.errors.name);
});

Deno.test('validateFormData: null for nullable field passes', () => {
  const values = {
    name: 'John Doe',
    email: 'john@example.com',
    age: null, // nullable field
  };

  const result = validateFormData(testUsers, values);

  assertEquals(result.success, true);
  assertExists(result.data);
});

Deno.test('validateFormData: wrong type fails', () => {
  const values = {
    name: 'John Doe',
    email: 'john@example.com',
    age: 'not a number', // should be number or null
  };

  const result = validateFormData(testUsers, values);

  assertEquals(result.success, false);
  assertExists(result.errors);
  assertExists(result.errors.age);
});

Deno.test('validateFormData: returns formError message', () => {
  const values = {
    // missing required fields
  };

  const result = validateFormData(testUsers, values, 'insert');

  assertEquals(result.success, false);
  assertExists(result.formError);
  assertEquals(result.formError, 'Please fix the errors below.');
});

// ============================================================================
// Insert vs Update mode tests
// ============================================================================

Deno.test('validateFormData: insert mode requires fields', () => {
  const values = {
    name: 'John', // only name provided, email missing
  };

  const result = validateFormData(testUsers, values, 'insert');

  assertEquals(result.success, false);
  assertExists(result.errors);
  assertExists(result.errors.email); // email is required in insert mode
});

Deno.test('validateFormData: update mode allows partial data', () => {
  const values = {
    name: 'Updated Name', // only updating name
    // email not provided - that's OK for update
  };

  const result = validateFormData(testUsers, values, 'update');

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.name, 'Updated Name');
});

Deno.test('validateFormData: update mode still validates types', () => {
  const values = {
    age: 'not a number', // wrong type, even in update mode
  };

  const result = validateFormData(testUsers, values, 'update');

  assertEquals(result.success, false);
  assertExists(result.errors);
  assertExists(result.errors.age);
});

Deno.test('validateFormData: defaults to insert mode', () => {
  const values = {
    name: 'John',
    // email missing
  };

  // No mode specified = defaults to 'insert'
  const result = validateFormData(testUsers, values);

  assertEquals(result.success, false);
  assertExists(result.errors);
  assertExists(result.errors.email);
});

// ============================================================================
// formatZodErrors tests
// ============================================================================

Deno.test('formatZodErrors: formats field errors', () => {
  // Create a mock ZodError manually
  const schema = z.object({
    name: z.string(),
    email: z.string().email(),
  });

  const result = schema.safeParse({
    name: 123, // wrong type
    email: 'not-an-email', // invalid format
  });

  if (result.success) {
    throw new Error('Expected validation to fail');
  }

  const errors = formatZodErrors(result.error);

  assertExists(errors.name);
  assertExists(errors.email);
});

Deno.test('formatZodErrors: uses first error for each field', () => {
  // If a field has multiple errors, we take the first one
  const schema = z.object({
    email: z.string().min(5).email(),
  });

  const result = schema.safeParse({
    email: 'ab', // fails both min(5) and email()
  });

  if (result.success) {
    throw new Error('Expected validation to fail');
  }

  const errors = formatZodErrors(result.error);

  assertExists(errors.email);
  // Should be a single string, not an array
  assertEquals(typeof errors.email, 'string');
});

Deno.test('formatZodErrors: handles nested paths', () => {
  // drizzle-zod uses flat paths, but test nested just in case
  const schema = z.object({
    user: z.object({
      name: z.string(),
    }),
  });

  const result = schema.safeParse({
    user: { name: 123 },
  });

  if (result.success) {
    throw new Error('Expected validation to fail');
  }

  const errors = formatZodErrors(result.error);

  // First path segment is used as key
  assertExists(errors.user);
});
