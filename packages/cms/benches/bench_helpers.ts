// Shared setup for the end-to-end handler benchmarks.
//
// The database is an in-memory node:sqlite instance wired to Drizzle through
// the sqlite-proxy driver, so a full Request→Response cycle measures CMS
// overhead (routing, auth, policies, validation, HTML rendering) plus a
// real-but-fast SQL engine — no external services, no wasm startup cost.

import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Bench secrets (long enough to pass validation)
export const BENCH_CSRF_SECRET =
  'bench-csrf-secret-for-benchmarks-min-32-chars';
export const BENCH_AUTH_SECRET =
  'bench-auth-secret-must-be-at-least-32-characters';

// ============================================================================
// Bench schema — mirrors the shapes used by the integration tests
// ============================================================================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email', { length: 255 }).notNull().unique(),
  name: text('name', { length: 100 }).notNull(),
  bio: text('bio'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(
    () => new Date(),
  ),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title', { length: 200 }).notNull(),
  body: text('body'),
  authorId: integer('author_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(
    () => new Date(),
  ),
});

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { length: 50 }),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));

export const schema = {
  users,
  posts,
  usersRelations,
  postsRelations,
  adminUsers,
};

// ============================================================================
// Database setup
// ============================================================================

// Generic database type, same convention as the integration tests
// deno-lint-ignore no-explicit-any
type AnyDb = any;

export interface BenchDbContext {
  sqlite: DatabaseSync;
  db: AnyDb;
}

/**
 * Create an in-memory SQLite database with the bench tables, exposed to
 * Drizzle via the sqlite-proxy driver.
 */
export function createBenchDb(): BenchDbContext {
  const sqlite = new DatabaseSync(':memory:');

  const db = drizzle(
    // deno-lint-ignore require-await
    async (query: string, params: unknown[], method: string) => {
      const stmt = sqlite.prepare(query);
      if (method === 'run') {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      if (method === 'get') {
        const row = stmt.get(...(params as never[]));
        // sqlite-proxy expects a single row as an array of values
        return { rows: row ? Object.values(row) : [] };
      }
      // 'all' / 'values': array of value-arrays. node:sqlite returns objects
      // whose property insertion order matches the SELECT column order.
      const rows = stmt.all(...(params as never[]));
      return { rows: rows.map((r) => Object.values(r)) };
    },
    { schema },
  );

  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      bio TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL
    );
    CREATE TABLE admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT
    );
  `);

  return { sqlite, db };
}

/**
 * Seed users and posts with direct prepared statements (outside any
 * measured region). Post authors cycle through the seeded users.
 */
export function seedData(
  sqlite: DatabaseSync,
  counts: { users: number; posts: number },
): void {
  const now = Math.floor(Date.now() / 1000);

  const insertUser = sqlite.prepare(
    'INSERT INTO users (email, name, bio, is_admin, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (let i = 1; i <= counts.users; i++) {
    insertUser.run(
      `user${i}@example.com`,
      `User ${i}`,
      i % 3 === 0 ? null : `Bio for user ${i}`,
      i === 1 ? 1 : 0,
      now,
    );
  }

  const insertPost = sqlite.prepare(
    'INSERT INTO posts (title, body, author_id, created_at) VALUES (?, ?, ?, ?)',
  );
  for (let i = 1; i <= counts.posts; i++) {
    insertPost.run(
      `Post ${i}: a title with <markup> & entities`,
      `Body of post ${i}. `.repeat(10),
      (i % counts.users) + 1,
      now,
    );
  }
}
