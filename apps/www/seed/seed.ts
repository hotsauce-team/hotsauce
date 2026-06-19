// Seed the marketing site with initial content

import { sql } from 'drizzle-orm';
import { db } from '../db.ts';
import { pages } from '../schema.ts';

// Create tables if not exist
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

// Clear existing pages and re-seed
await db.delete(pages);

// Insert pages
await db.insert(pages).values([
  {
    slug: 'home',
    title: 'Home',
    sortOrder: 0,
    content: `# hotsauce-cms

A schema-driven headless CMS derived from your Drizzle ORM definitions.

Define your database schema once — get a type-safe admin interface for free.

────────────────────────────────────

## Why hotsauce?

- **Single source of truth** — Your Drizzle schema defines database tables, TypeScript types, validation rules, AND CMS fields
- **Minimal dependencies** — Core stack is drizzle-orm + zod + drizzle-zod (all zero transitive deps)
- **Secure by default** — CSRF protection, JWT auth, row-level policies, column-level policies
- **Cross-runtime** — Works in Deno and Node.js

────────────────────────────────────

## Quick Start

\`\`\`bash
# Deno
deno add jsr:@hotsauce/core jsr:@hotsauce/ui jsr:@hotsauce/cms

# Node
npx jsr add @hotsauce/core @hotsauce/ui @hotsauce/cms
\`\`\`

[View the demo →](https://demo.hotsaucecms.com/)
`,
  },
  {
    slug: 'docs',
    title: 'Docs',
    sortOrder: 1,
    content: `# Documentation

Each package has its own README with detailed API documentation:

- [@hotsauce/core](https://github.com/hotsauce-team/hotsauce-cms/tree/main/packages/core) — Schema introspection, field mapping
- [@hotsauce/ui](https://github.com/hotsauce-team/hotsauce-cms/tree/main/packages/ui) — HTML generation, form rendering
- [@hotsauce/cms](https://github.com/hotsauce-team/hotsauce-cms/tree/main/packages/cms) — CRUD route handlers
- [@hotsauce/auth](https://github.com/hotsauce-team/hotsauce-cms/tree/main/packages/auth) — JWT, password hashing, TOTP
- [@hotsauce/plugins](https://github.com/hotsauce-team/hotsauce-cms/tree/main/packages/plugins) — Official plugins

────────────────────────────────────

## Basic Usage

\`\`\`typescript
import { createCmsHandler } from '@hotsauce/cms';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const client = postgres(Deno.env.get('DATABASE_URL')!);
const db = drizzle(client, { schema });

const handler = createCmsHandler({
  schema,
  db,
  basePath: '/admin',
  auth: 'dangerously-open',
});

Deno.serve(handler);
\`\`\`
`,
  },
  {
    slug: 'about',
    title: 'About',
    sortOrder: 2,
    content: `# About

hotsauce-cms is built by developers who got tired of:

1. Defining the same fields in three places (database, TypeScript, CMS)
2. Wrestling with bloated admin panels
3. Debugging mysterious type mismatches

We wanted something that just reads your Drizzle schema and generates the admin UI automatically.

────────────────────────────────────

## Philosophy

**Zero magic.** Everything derives from your schema. If you can read Drizzle, you can understand what hotsauce will generate.

**Zero lock-in.** It's just a Request → Response handler. Works with any server.

**Zero bloat.** The entire dependency tree is auditable in minutes.

────────────────────────────────────

## License

MIT. Do whatever you want.

[GitHub →](https://github.com/hotsauce-team/hotsauce-cms)
`,
  },
]);

// deno-lint-ignore no-console
console.log('✓ Seeded 3 pages');
