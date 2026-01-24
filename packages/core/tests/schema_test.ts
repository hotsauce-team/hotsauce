// Test: Schema introspection
// Verifies we can extract metadata from Drizzle schemas

import { assertEquals, assertExists } from 'jsr:@std/assert';
import * as pgSchema from './fixtures/schema-pg.ts';
import * as sqliteSchema from './fixtures/schema-sqlite.ts';

// These tests explore what metadata Drizzle exposes on schemas
// Findings here inform the introspection implementation

// ============================================================================
// PostgreSQL Schema Tests
// ============================================================================

Deno.test('schema [postgres] - tables are importable', () => {
  // Basic sanity check that our test schema loads
  assertExists(pgSchema.users);
  assertExists(pgSchema.posts);
  assertExists(pgSchema.categories);
  assertExists(pgSchema.uploads);
  assertExists(pgSchema.settings);
  assertExists(pgSchema.postsToCategories);
});

Deno.test('schema [postgres] - enum is defined', () => {
  assertExists(pgSchema.postStatus);
  // pgEnum creates an object with enumValues
  assertEquals(pgSchema.postStatus.enumValues, [
    'draft',
    'published',
    'archived',
  ]);
});

Deno.test('schema [postgres] - can access table columns', () => {
  // Drizzle tables have columns accessible as properties
  const userColumns = Object.keys(pgSchema.users);

  // Should include our defined columns
  assertEquals(userColumns.includes('id'), true);
  assertEquals(userColumns.includes('email'), true);
  assertEquals(userColumns.includes('name'), true);
  assertEquals(userColumns.includes('bio'), true);
  assertEquals(userColumns.includes('isAdmin'), true);
});

Deno.test('schema [postgres] - column has metadata', () => {
  // Each column should have introspectable properties
  const emailColumn = pgSchema.users.email;

  assertExists(emailColumn);

  // Key properties available on columns:
  // - name, columnType, dataType, notNull, hasDefault, isUnique, primary
  // - length (for varchar), enumValues (for enums)
  assertEquals(emailColumn.name, 'email');
  assertEquals(emailColumn.columnType, 'PgVarchar');
  assertEquals(emailColumn.notNull, true);
});

Deno.test('schema [postgres] - foreign key references', () => {
  // posts.authorId references users.id
  const authorIdColumn = pgSchema.posts.authorId;

  assertExists(authorIdColumn);
  assertEquals(authorIdColumn.name, 'author_id');
  assertEquals(authorIdColumn.columnType, 'PgInteger');
  assertEquals(authorIdColumn.notNull, true);
});

Deno.test('schema [postgres] - relations are defined', () => {
  assertExists(pgSchema.usersRelations);
  assertExists(pgSchema.postsRelations);
  assertExists(pgSchema.categoriesRelations);
});

// ============================================================================
// SQLite Schema Tests
// ============================================================================

Deno.test('schema [sqlite] - tables are importable', () => {
  // Basic sanity check that our test schema loads
  assertExists(sqliteSchema.users);
  assertExists(sqliteSchema.posts);
  assertExists(sqliteSchema.categories);
  assertExists(sqliteSchema.uploads);
  assertExists(sqliteSchema.settings);
  assertExists(sqliteSchema.postsToCategories);
});

Deno.test('schema [sqlite] - can access table columns', () => {
  // Drizzle tables have columns accessible as properties
  const userColumns = Object.keys(sqliteSchema.users);

  // Should include our defined columns
  assertEquals(userColumns.includes('id'), true);
  assertEquals(userColumns.includes('email'), true);
  assertEquals(userColumns.includes('name'), true);
  assertEquals(userColumns.includes('bio'), true);
  assertEquals(userColumns.includes('isAdmin'), true);
});

Deno.test('schema [sqlite] - column has metadata', () => {
  // Each column should have introspectable properties
  const emailColumn = sqliteSchema.users.email;

  assertExists(emailColumn);

  // Key properties available on columns:
  // - name, columnType, dataType, notNull, hasDefault, isUnique, primary
  // - length (for text), enumValues (for text enums)
  assertEquals(emailColumn.name, 'email');
  assertEquals(emailColumn.columnType, 'SQLiteText');
  assertEquals(emailColumn.notNull, true);
});

Deno.test('schema [sqlite] - foreign key references', () => {
  // posts.authorId references users.id
  const authorIdColumn = sqliteSchema.posts.authorId;

  assertExists(authorIdColumn);
  assertEquals(authorIdColumn.name, 'author_id');
  assertEquals(authorIdColumn.columnType, 'SQLiteInteger');
  assertEquals(authorIdColumn.notNull, true);
});

Deno.test('schema [sqlite] - relations are defined', () => {
  assertExists(sqliteSchema.usersRelations);
  assertExists(sqliteSchema.postsRelations);
  assertExists(sqliteSchema.categoriesRelations);
});

Deno.test('schema [sqlite] - text enum has values', () => {
  // SQLite uses text with enum constraint instead of pgEnum
  const statusColumn = sqliteSchema.posts.status;

  assertExists(statusColumn);
  assertEquals(statusColumn.columnType, 'SQLiteText');
  // SQLite text columns with enum have enumValues property
  assertEquals(statusColumn.enumValues, ['draft', 'published', 'archived']);
});
