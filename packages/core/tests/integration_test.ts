// Test: Database integration
// Verifies test fixtures work with PGlite (Postgres) and sql.js (SQLite)

import { assertEquals, assertExists } from 'jsr:@std/assert@1.0.16';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { drizzle as drizzleSqlJs } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { sql } from 'drizzle-orm';
import * as pgSchema from './fixtures/schema-pg.ts';
import * as sqliteSchema from './fixtures/schema-sqlite.ts';

// Helper to create a fresh Postgres database for each test
function createPgTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema: pgSchema });
  return { client, db };
}

// Helper to create a fresh SQLite database for each test
async function createSqliteTestDb() {
  const SQL = await initSqlJs();
  const client = new SQL.Database();
  const db = drizzleSqlJs(client, { schema: sqliteSchema });
  return { client, db };
}

// ============================================================================
// PGlite Integration Tests
// ============================================================================

Deno.test('pglite - can connect', async () => {
  const { client, db } = createPgTestDb();

  // Simple query to verify connection
  const result = await db.execute(sql`SELECT 1 as num`);
  assertEquals(result.rows[0]?.num, 1);

  await client.close();
});

Deno.test('pglite - can create tables from schema', async () => {
  const { client, db } = createPgTestDb();

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

  const tableNames = tables.rows.map((r) =>
    (r as { table_name: string }).table_name
  );
  assertEquals(tableNames.includes('users'), true);
  assertEquals(tableNames.includes('posts'), true);

  await client.close();
});

Deno.test('pglite - can insert and query with drizzle', async () => {
  const { client, db } = createPgTestDb();

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
  const inserted = await db.insert(pgSchema.users).values({
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
  const users = await db.select().from(pgSchema.users);
  assertEquals(users.length, 1);
  assertEquals(users[0]!.email, 'test@example.com');

  await client.close();
});

// ============================================================================
// SQLite (sql.js) Integration Tests
// ============================================================================

Deno.test('sql.js - can connect', async () => {
  const { client, db } = await createSqliteTestDb();

  // Simple query to verify connection
  const result = db.get<{ num: number }>(sql`SELECT 1 as num`);
  assertEquals(result?.num, 1);

  client.close();
});

Deno.test('sql.js - can create tables from schema', async () => {
  const { client, db } = await createSqliteTestDb();

  // Create users table
  db.run(sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create posts table
  db.run(sql`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT,
      body TEXT,
      tags TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      author_id INTEGER NOT NULL REFERENCES users(id),
      featured_image_id TEXT,
      published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Verify tables exist
  const tables = db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `);

  const tableNames = tables.map((r) => r.name);
  assertEquals(tableNames.includes('users'), true);
  assertEquals(tableNames.includes('posts'), true);

  client.close();
});

Deno.test('sql.js - can insert and query with drizzle', async () => {
  const { client, db } = await createSqliteTestDb();

  // Setup tables
  db.run(sql`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bio TEXT,
      avatar_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Insert using Drizzle
  const inserted = db.insert(sqliteSchema.users).values({
    email: 'test@example.com',
    name: 'Test User',
  }).returning().all();

  const first = inserted[0]!;
  assertEquals(inserted.length, 1);
  assertEquals(first.email, 'test@example.com');
  assertEquals(first.name, 'Test User');
  assertEquals(first.isAdmin, false);
  assertExists(first.id);

  // Query using Drizzle
  const users = db.select().from(sqliteSchema.users).all();
  assertEquals(users.length, 1);
  assertEquals(users[0]!.email, 'test@example.com');

  client.close();
});
