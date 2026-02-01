// deno-lint-ignore-file no-explicit-any no-console
// Test: Drizzle ORM Compatibility
// These tests verify our assumptions about Drizzle internals remain valid.
// If these fail after a Drizzle upgrade, our prototype extensions may be broken.

import { assertEquals, assertExists } from '@std/assert';
import { getTableColumns, getTableName, is, Table } from 'drizzle-orm';

// ============================================================================
// Column Builder Internals
// ============================================================================

Deno.test('drizzle-compat: PgColumnBuilder class exists and is accessible', async () => {
  const { PgColumnBuilder } = await import('drizzle-orm/pg-core');
  assertExists(PgColumnBuilder, 'PgColumnBuilder should be exported');
  assertExists(
    PgColumnBuilder.prototype,
    'PgColumnBuilder.prototype should exist',
  );
});

Deno.test('drizzle-compat: SQLiteColumnBuilder class exists and is accessible', async () => {
  const { SQLiteColumnBuilder } = await import('drizzle-orm/sqlite-core');
  assertExists(SQLiteColumnBuilder, 'SQLiteColumnBuilder should be exported');
  assertExists(
    SQLiteColumnBuilder.prototype,
    'SQLiteColumnBuilder.prototype should exist',
  );
});

Deno.test('drizzle-compat: MySqlColumnBuilder class exists and is accessible', async () => {
  const { MySqlColumnBuilder } = await import('drizzle-orm/mysql-core');
  assertExists(MySqlColumnBuilder, 'MySqlColumnBuilder should be exported');
  assertExists(
    MySqlColumnBuilder.prototype,
    'MySqlColumnBuilder.prototype should exist',
  );
});

// ============================================================================
// Column Builder Config Object
// ============================================================================

Deno.test('drizzle-compat: column builder has config property', async () => {
  const { jsonb } = await import('drizzle-orm/pg-core');

  const col = jsonb('test');

  // The config object should exist on the builder
  // This is critical for our $cms() extension
  assertExists(
    (col as any).config,
    'Column builder should have config property',
  );
});

Deno.test('drizzle-compat: config has expected base properties', async () => {
  const { jsonb } = await import('drizzle-orm/pg-core');

  const col = jsonb('test_column');
  const config = (col as any).config;

  // These properties should exist on the config object
  assertEquals(
    config.name,
    'test_column',
    'config.name should match column name',
  );
  assertEquals(
    typeof config.notNull,
    'boolean',
    'config.notNull should be boolean',
  );
  assertEquals(
    typeof config.hasDefault,
    'boolean',
    'config.hasDefault should be boolean',
  );
  assertEquals(
    typeof config.primaryKey,
    'boolean',
    'config.primaryKey should be boolean',
  );
});

Deno.test('drizzle-compat: config can be extended with custom properties', async () => {
  const { jsonb } = await import('drizzle-orm/pg-core');

  const col = jsonb('test');
  const config = (col as any).config;

  // We should be able to add custom properties
  config.customProperty = { foo: 'bar' };

  assertEquals(
    (col as any).config.customProperty,
    { foo: 'bar' },
    'Custom properties should persist on config',
  );
});

// ============================================================================
// Config Flow: Builder → Built Column
// ============================================================================

Deno.test('drizzle-compat: config flows from builder to built column', async () => {
  const { pgTable, jsonb } = await import('drizzle-orm/pg-core');

  // Create a column builder and add custom config
  const colBuilder = jsonb('avatar');
  (colBuilder as any).config.testMarker = { isFile: true };

  // Build the table (which builds the columns)
  const testTable = pgTable('test_table', {
    avatar: colBuilder,
  });

  // The built column should have our custom config
  const builtColumn = testTable.avatar;
  const builtConfig = (builtColumn as any).config;

  assertExists(builtConfig, 'Built column should have config');
  assertEquals(
    builtConfig.testMarker,
    { isFile: true },
    'Custom config should flow from builder to built column',
  );
});

Deno.test('drizzle-compat: config survives chained methods', async () => {
  const { pgTable, jsonb } = await import('drizzle-orm/pg-core');

  // Add custom config, then chain Drizzle methods
  const colBuilder = jsonb('data');
  (colBuilder as any).config.cmsOptions = { file: true };

  // Chain standard Drizzle methods
  const chainedBuilder = colBuilder.notNull().default({});

  // Custom config should survive the chain
  assertEquals(
    (chainedBuilder as any).config.cmsOptions,
    { file: true },
    'Custom config should survive method chaining',
  );

  // Build and verify
  const testTable = pgTable('test', { data: chainedBuilder });
  assertEquals(
    (testTable.data as any).config.cmsOptions,
    { file: true },
    'Custom config should survive building',
  );
});

// ============================================================================
// SQLite Compatibility
// ============================================================================

Deno.test('drizzle-compat: SQLite column builder has config', async () => {
  const { text } = await import('drizzle-orm/sqlite-core');

  const col = text('test');
  assertExists((col as any).config, 'SQLite column builder should have config');
});

Deno.test('drizzle-compat: SQLite config flows to built column', async () => {
  const { sqliteTable, text } = await import('drizzle-orm/sqlite-core');

  const colBuilder = text('data');
  (colBuilder as any).config.cmsOptions = { file: true };

  const testTable = sqliteTable('test', { data: colBuilder });

  assertEquals(
    (testTable.data as any).config.cmsOptions,
    { file: true },
    'SQLite custom config should flow to built column',
  );
});

// ============================================================================
// MySQL Compatibility
// ============================================================================

Deno.test('drizzle-compat: MySQL column builder has config', async () => {
  const { json } = await import('drizzle-orm/mysql-core');

  const col = json('test');
  assertExists((col as any).config, 'MySQL column builder should have config');
});

Deno.test('drizzle-compat: MySQL config flows to built column', async () => {
  const { mysqlTable, json } = await import('drizzle-orm/mysql-core');

  const colBuilder = json('data');
  (colBuilder as any).config.cmsOptions = { file: true };

  const testTable = mysqlTable('test', { data: colBuilder });

  assertEquals(
    (testTable.data as any).config.cmsOptions,
    { file: true },
    'MySQL custom config should flow to built column',
  );
});

// ============================================================================
// Standard Drizzle Helpers (should remain stable)
// ============================================================================

Deno.test('drizzle-compat: getTableName helper works', async () => {
  const { pgTable, serial, text } = await import('drizzle-orm/pg-core');

  const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name'),
  });

  assertEquals(getTableName(users), 'users');
});

Deno.test('drizzle-compat: getTableColumns helper works', async () => {
  const { pgTable, serial, text } = await import('drizzle-orm/pg-core');

  const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: text('name'),
  });

  const columns = getTableColumns(users);
  assertExists(columns.id);
  assertExists(columns.name);
});

Deno.test('drizzle-compat: is() type guard works with Table', async () => {
  const { pgTable, serial } = await import('drizzle-orm/pg-core');

  const users = pgTable('users', {
    id: serial('id').primaryKey(),
  });

  assertEquals(is(users, Table), true);
  assertEquals(is({}, Table), false);
});

// ============================================================================
// Version Reporting (for CI visibility)
// ============================================================================

Deno.test('drizzle-compat: report drizzle-orm version', async () => {
  // This test always passes but logs the version for CI visibility
  // If imports fail, we'll know something is very wrong

  const drizzle = await import('drizzle-orm');
  const pgCore = await import('drizzle-orm/pg-core');
  const sqliteCore = await import('drizzle-orm/sqlite-core');
  const mysqlCore = await import('drizzle-orm/mysql-core');

  console.log('✓ drizzle-orm imported successfully');
  console.log('✓ drizzle-orm/pg-core imported successfully');
  console.log('✓ drizzle-orm/sqlite-core imported successfully');
  console.log('✓ drizzle-orm/mysql-core imported successfully');

  // Log some identifiable info
  assertExists(drizzle.sql, 'drizzle-orm should export sql');
  assertExists(pgCore.pgTable, 'pg-core should export pgTable');
  assertExists(sqliteCore.sqliteTable, 'sqlite-core should export sqliteTable');
  assertExists(mysqlCore.mysqlTable, 'mysql-core should export mysqlTable');
});

// ============================================================================
// Table Class Internals (for table-level $cms() extension)
// ============================================================================

Deno.test('drizzle-compat: PgTable class exists and has prototype', async () => {
  const { PgTable } = await import('drizzle-orm/pg-core');
  assertExists(PgTable, 'PgTable should be exported');
  assertExists(PgTable.prototype, 'PgTable.prototype should exist');
});

Deno.test('drizzle-compat: SQLiteTable class exists and has prototype', async () => {
  const { SQLiteTable } = await import('drizzle-orm/sqlite-core');
  assertExists(SQLiteTable, 'SQLiteTable should be exported');
  assertExists(SQLiteTable.prototype, 'SQLiteTable.prototype should exist');
});

Deno.test('drizzle-compat: MySqlTable class exists and has prototype', async () => {
  const { MySqlTable } = await import('drizzle-orm/mysql-core');
  assertExists(MySqlTable, 'MySqlTable should be exported');
  assertExists(MySqlTable.prototype, 'MySqlTable.prototype should exist');
});

Deno.test('drizzle-compat: PgTable instance can have custom symbol properties', async () => {
  const { pgTable, serial } = await import('drizzle-orm/pg-core');

  const TEST_SYMBOL = Symbol.for('hotsauce-cms:test');
  const table = pgTable('test', {
    id: serial('id').primaryKey(),
  });

  // We should be able to attach a symbol property to the table instance
  (table as any)[TEST_SYMBOL] = { label: 'Test Table' };

  assertEquals(
    (table as any)[TEST_SYMBOL],
    { label: 'Test Table' },
    'Custom symbol properties should persist on PgTable instance',
  );
});

Deno.test('drizzle-compat: SQLiteTable instance can have custom symbol properties', async () => {
  const { sqliteTable, integer } = await import('drizzle-orm/sqlite-core');

  const TEST_SYMBOL = Symbol.for('hotsauce-cms:test');
  const table = sqliteTable('test', {
    id: integer('id').primaryKey(),
  });

  (table as any)[TEST_SYMBOL] = { label: 'Test Table' };

  assertEquals(
    (table as any)[TEST_SYMBOL],
    { label: 'Test Table' },
    'Custom symbol properties should persist on SQLiteTable instance',
  );
});

Deno.test('drizzle-compat: MySqlTable instance can have custom symbol properties', async () => {
  const { mysqlTable, serial } = await import('drizzle-orm/mysql-core');

  const TEST_SYMBOL = Symbol.for('hotsauce-cms:test');
  const table = mysqlTable('test', {
    id: serial('id').primaryKey(),
  });

  (table as any)[TEST_SYMBOL] = { label: 'Test Table' };

  assertEquals(
    (table as any)[TEST_SYMBOL],
    { label: 'Test Table' },
    'Custom symbol properties should persist on MySqlTable instance',
  );
});

Deno.test('drizzle-compat: table prototype can be extended', async () => {
  const { PgTable, pgTable, serial } = await import('drizzle-orm/pg-core');

  // Verify we can add methods to the prototype (our $cms() approach)
  const proto = PgTable.prototype as unknown as Record<string, unknown>;
  const originalMethod = proto.testMethod;
  proto.testMethod = function () {
    return 'extended';
  };

  const table = pgTable('test', {
    id: serial('id').primaryKey(),
  });

  assertEquals(
    (table as any).testMethod(),
    'extended',
    'Prototype methods should be callable on table instances',
  );

  // Cleanup
  if (originalMethod === undefined) {
    delete proto.testMethod;
  } else {
    proto.testMethod = originalMethod;
  }
});
