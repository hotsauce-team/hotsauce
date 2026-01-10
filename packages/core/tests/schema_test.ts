// Test: Schema introspection
// Verifies we can extract metadata from Drizzle schemas

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from './fixtures/schema.ts';

// These tests explore what metadata Drizzle exposes on schemas
// Findings here inform the introspection implementation

// Helper to create a fresh database for each test
async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return { client, db };
}

Deno.test('schema - tables are importable', () => {
  // Basic sanity check that our test schema loads
  assertExists(schema.users);
  assertExists(schema.posts);
  assertExists(schema.categories);
  assertExists(schema.uploads);
  assertExists(schema.settings);
  assertExists(schema.postsToCategories);
});

Deno.test('schema - enum is defined', () => {
  assertExists(schema.postStatus);
  // pgEnum creates an object with enumValues
  assertEquals(schema.postStatus.enumValues, ['draft', 'published', 'archived']);
});

Deno.test('schema - can access table columns', () => {
  // Drizzle tables have columns accessible as properties
  const userColumns = Object.keys(schema.users);
  
  // Should include our defined columns
  assertEquals(userColumns.includes('id'), true);
  assertEquals(userColumns.includes('email'), true);
  assertEquals(userColumns.includes('name'), true);
  assertEquals(userColumns.includes('bio'), true);
  assertEquals(userColumns.includes('isAdmin'), true);
});

Deno.test('schema - column has metadata', () => {
  // Each column should have introspectable properties
  const emailColumn = schema.users.email;
  
  assertExists(emailColumn);
  
  // Key properties available on columns:
  // - name, columnType, dataType, notNull, hasDefault, isUnique, primary
  // - length (for varchar), enumValues (for enums)
  assertEquals(emailColumn.name, 'email');
  assertEquals(emailColumn.columnType, 'PgVarchar');
  assertEquals(emailColumn.notNull, true);
});

Deno.test('schema - foreign key references', () => {
  // posts.authorId references users.id
  const authorIdColumn = schema.posts.authorId;
  
  assertExists(authorIdColumn);
  assertEquals(authorIdColumn.name, 'author_id');
  assertEquals(authorIdColumn.columnType, 'PgInteger');
  assertEquals(authorIdColumn.notNull, true);
});

Deno.test('schema - relations are defined', () => {
  assertExists(schema.usersRelations);
  assertExists(schema.postsRelations);
  assertExists(schema.categoriesRelations);
});

// PGlite integration tests

Deno.test('pglite - can connect', async () => {
  const { client, db } = await createTestDb();
  
  // Simple query to verify connection
  const result = await db.execute(sql`SELECT 1 as num`);
  assertEquals(result.rows[0]?.num, 1);
  
  await client.close();
});

Deno.test('pglite - can create tables from schema', async () => {
  const { client, db } = await createTestDb();
  
  // Create the enum first (required for posts table)
  await db.execute(sql`
    CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived')
  `);
  
  // Create users table
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      avatar_url VARCHAR(500),
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Create posts table
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(200) NOT NULL UNIQUE,
      excerpt VARCHAR(500),
      body TEXT,
      status post_status NOT NULL DEFAULT 'draft',
      author_id INTEGER NOT NULL REFERENCES users(id),
      featured_image_id UUID,
      published_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Verify tables exist
  const tables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  
  const tableNames = tables.rows.map((r) => (r as { table_name: string }).table_name);
  assertEquals(tableNames.includes('users'), true);
  assertEquals(tableNames.includes('posts'), true);
  
  await client.close();
});

Deno.test('pglite - can insert and query with drizzle', async () => {
  const { client, db } = await createTestDb();
  
  // Setup tables
  await db.execute(sql`
    CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived')
  `);
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      avatar_url VARCHAR(500),
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Insert using Drizzle
  const inserted = await db.insert(schema.users).values({
    email: 'test@example.com',
    name: 'Test User',
  }).returning();
  
  const first = inserted[0]!;
  assertEquals(inserted.length, 1);
  assertEquals(first.email, 'test@example.com');
  assertEquals(first.name, 'Test User');
  assertEquals(first.isAdmin, false);
  assertExists(first.id);
  
  // Query using Drizzle
  const users = await db.select().from(schema.users);
  assertEquals(users.length, 1);
  assertEquals(users[0]!.email, 'test@example.com');
  
  await client.close();
});

