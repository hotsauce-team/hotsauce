/**
 * Benchmarks for schema introspection cold-start cost.
 *
 * Run: deno bench packages/core/benches/
 */

import { introspectFullSchema } from '@hotsauce/core';
import * as pgSchema from '../tests/fixtures/schema-pg.ts';
import * as sqliteSchema from '../tests/fixtures/schema-sqlite.ts';

// ── Postgres schema (7 tables: users, posts, categories, postsToCategories, uploads, settings + relations) ──

Deno.bench(
  'introspectFullSchema — Postgres fixture (7 tables)',
  () => {
    introspectFullSchema(pgSchema);
  },
);

// ── SQLite schema (same structure, SQLite dialect) ──

Deno.bench(
  'introspectFullSchema — SQLite fixture (7 tables)',
  () => {
    introspectFullSchema(sqliteSchema);
  },
);
