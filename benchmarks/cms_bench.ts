// Benchmarks for the CMS's critical user-facing path: the full
// request -> response CRUD flow through `createCmsHandler(options)(request)`.
//
// Each case is benchmarked against both supported driver families:
//   - PGlite   (Postgres dialect)
//   - sql.js   (SQLite dialect)
//
// Benchmark names are stable ("<driver>: <case>") so benchmarks/compare.ts can
// match the same case across two `deno bench --json` runs (PR vs main).
//
// These files live outside packages/*/, so `Deno.bench` / `Deno.*` usage is
// allowed here (the runtime-agnostic rule only applies to shipped package code).

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzleSqlJs } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Patches Drizzle prototypes (.$cms etc.) — imported for side effects.
import '@hotsauce/core/extend';
import { createCmsHandler } from '@hotsauce/cms';
import { generateCsrfToken } from '../packages/cms/csrf.ts';
import {
  createBasicTables,
  createFormData,
  generateSourceToken,
  schema as pgSchema,
  SOURCE,
  TEST_CSRF_SECRET,
  users as pgUsers,
} from '../packages/cms/tests/integration_helpers.ts';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BASE_PATH = '/admin';
const SEED_USERS = 10;

// CSRF + source tokens are stateless, signed, and valid for 4 hours, so we
// generate them once and reuse them across the create iterations.
const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
const sourceToken = await generateSourceToken(SOURCE.CMS, TEST_CSRF_SECRET);

// deno-lint-ignore no-explicit-any
function buildHandler(db: any, schema: any) {
  return createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema,
    basePath: BASE_PATH,
  });
}

function createRequest(): Request {
  return new Request(`http://localhost${BASE_PATH}/users`);
}

function readRequest(): Request {
  return new Request(`http://localhost${BASE_PATH}/users/1`);
}

// Each create needs a unique email (UNIQUE constraint). Counter keeps it cheap.
let createCounter = 0;
function newUserRequest(): Request {
  createCounter += 1;
  const formData = createFormData({
    __cms_csrf: csrfToken,
    __cms_source: sourceToken,
    email: `bench-${createCounter}@example.com`,
    name: `Bench User ${createCounter}`,
    bio: 'created during benchmarking',
  });
  return new Request(`http://localhost${BASE_PATH}/users/new`, {
    method: 'POST',
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// PGlite (Postgres) setup
// ---------------------------------------------------------------------------

const pgClient = new PGlite();
const pgDb = drizzlePglite(pgClient, { schema: pgSchema });
await createBasicTables(pgDb);
await pgDb.insert(pgUsers).values(
  Array.from({ length: SEED_USERS }, (_, i) => ({
    email: `seed-${i}@example.com`,
    name: `Seed User ${i}`,
    bio: 'seed row',
  })),
);
const pgHandler = buildHandler(pgDb, pgSchema);

// ---------------------------------------------------------------------------
// sql.js (SQLite) setup
// ---------------------------------------------------------------------------

const sqliteUsers = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  bio: text('bio'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(
    () => new Date(),
  ),
});

const sqlitePosts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body'),
  authorId: integer('author_id').notNull().references(() => sqliteUsers.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(
    () => new Date(),
  ),
});

const sqliteSchema = { users: sqliteUsers, posts: sqlitePosts };

const SQL = await initSqlJs();
const sqliteClient = new SQL.Database();
const sqliteDb = drizzleSqlJs(sqliteClient, { schema: sqliteSchema });

sqliteDb.run(sql`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    bio TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )
`);
sqliteDb.run(sql`
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  )
`);
await sqliteDb.insert(sqliteUsers).values(
  Array.from({ length: SEED_USERS }, (_, i) => ({
    email: `seed-${i}@example.com`,
    name: `Seed User ${i}`,
    bio: 'seed row',
  })),
);
const sqliteHandler = buildHandler(sqliteDb, sqliteSchema);

// ---------------------------------------------------------------------------
// Benchmarks
//
// Ordered list -> read -> create per driver so the row-growing create case runs
// last and does not skew the list/read cases.
// ---------------------------------------------------------------------------

Deno.bench('pglite: list users', { group: 'list users' }, async () => {
  const res = await pgHandler(createRequest());
  await res.text();
});

Deno.bench('sqlite: list users', { group: 'list users' }, async () => {
  const res = await sqliteHandler(createRequest());
  await res.text();
});

Deno.bench('pglite: read user', { group: 'read user' }, async () => {
  const res = await pgHandler(readRequest());
  await res.text();
});

Deno.bench('sqlite: read user', { group: 'read user' }, async () => {
  const res = await sqliteHandler(readRequest());
  await res.text();
});

Deno.bench('pglite: create user', { group: 'create user' }, async () => {
  const res = await pgHandler(newUserRequest());
  await res.body?.cancel();
});

Deno.bench('sqlite: create user', { group: 'create user' }, async () => {
  const res = await sqliteHandler(newUserRequest());
  await res.body?.cancel();
});
