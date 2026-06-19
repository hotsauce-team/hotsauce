// Create database tables (safe to run multiple times)

import { sql } from 'drizzle-orm';
import { db } from '../db.ts';

await db.run(sql`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

await db.run(sql`
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  )
`);

// deno-lint-ignore no-console
console.log('✓ Tables created');
