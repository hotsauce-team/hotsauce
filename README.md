# drizzle-cms

A schema-driven CMS derived from your Drizzle ORM definitions. Define your database schema once — get a type-safe admin interface for free.

## Philosophy

- **Single source of truth**: Your Drizzle schema defines database tables, TypeScript types, validation rules, AND CMS fields
- **Minimal dependencies**: Core stack is drizzle-orm + zod + postgres (all zero-dep packages)
- **Cross-runtime**: Works in Deno and Node.js
- **Postgres-first**: Full support for RLS, arrays, JSONB, and advanced features — designed for extensibility to other databases later
- **RLS-ready**: Layer Postgres Row-Level Security for bulletproof permissions

## Packages

```
packages/
├── core/           # Schema introspection, field mapping, validation
│   │               # Runtime-agnostic, zero Deno/Node specific code
│   ├── schema/     # Schema parsing and metadata extraction
│   ├── fields/     # Column type → CMS field mapping
│   └── validation/ # drizzle-zod integration
│
├── ui/             # HTML generation, form rendering
│   │               # Pure functions returning strings, zero dependencies
│   ├── html.ts     # Tagged template with auto-escaping
│   ├── forms/      # Form field renderers (text, select, etc.)
│   ├── views/      # List, detail, edit views
│   └── components/ # Layout, pagination, alerts
│
└── handlers/       # CRUD route handlers (Web Standard Request/Response)
    │               # Bring Your Own Server - works with any framework
    ├── router.ts   # URL routing and handler dispatch
    ├── crud.ts     # List, create, read, update, delete handlers
    └── types.ts    # Handler types and options
```

## Bring Your Own Server

The handlers package exports a single function that returns a Web Standard `Request → Response` handler. Wire it up to any server:

```typescript
import { createCmsHandler } from '@drizzle-cms/handlers';
import { introspect } from '@drizzle-cms/core';
import * as schema from './schema.ts';

const handler = createCmsHandler({
  schema: introspect(schema),
  db,
  basePath: '/admin',
});

// Deno
Deno.serve(handler);

// Node 18+
import { createServer } from 'node:http';
// ... convert Request/Response

// Hono
app.all('/admin/*', (c) => handler(c.req.raw));

// Express
app.use('/admin', expressAdapter(handler));
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│              Drizzle Schema + CMS Hints             │
│                                                     │
│   const posts = pgTable('posts', {                  │
│     title: varchar('title').notNull(),              │
│     body: text('body'),                             │
│   });                                               │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌─────────┐  ┌──────────┐  ┌──────────┐
    │ DB      │  │ Zod      │  │ CMS      │
    │ Tables  │  │ Schemas  │  │ Fields   │
    └─────────┘  └──────────┘  └──────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Admin UI      │
              │  (auto-gen)    │
              └────────────────┘
```

## Column → Field Mapping

| Drizzle Type | CMS Field | Notes |
|--------------|-----------|-------|
| `varchar` | `text` | With maxLength from column def |
| `text` | `textarea` | Override to `richtext` via hint |
| `boolean` | `checkbox` | |
| `integer` / `real` | `number` | |
| `timestamp` | `datetime` | |
| `date` | `date` | |
| `json` / `jsonb` | `object` | Requires sub-schema hint |
| `text[]` / arrays | `list` | Postgres-only |
| `pgEnum` | `select` | Postgres-only |
| Foreign key | `relation` | Auto-detected from references |
| `uuid` + upload ref | `file` | Convention-based |

## CMS Hints

Extend columns with CMS-specific metadata:

```typescript
import { pgTable, varchar, text } from 'drizzle-orm/pg-core';
import { cmsField } from '@drizzle-cms/core';

export const posts = pgTable('posts', {
  title: varchar('title', { length: 200 })
    .notNull()
    .$withMeta(cmsField({
      label: 'Post Title',
      placeholder: 'Enter a compelling title...',
    })),
  
  body: text('body')
    .$withMeta(cmsField({
      widget: 'richtext',  // Override default textarea
      help: 'Supports Markdown',
    })),
  
  slug: varchar('slug', { length: 100 })
    .$withMeta(cmsField({
      hidden: true,  // Auto-generated, hide from form
    })),
});
```

## Installation

```bash
# Deno
deno add jsr:@drizzle-cms/core jsr:@drizzle-cms/ui jsr:@drizzle-cms/handlers

# Node
npx jsr add @drizzle-cms/core @drizzle-cms/ui @drizzle-cms/handlers
```

## Quick Start

```typescript
import { createCmsHandler } from '@drizzle-cms/handlers';
import { introspect } from '@drizzle-cms/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const client = postgres(Deno.env.get('DATABASE_URL')!);
const db = drizzle(client, { schema });

const handler = createCmsHandler({
  schema: introspect(schema),
  db,
  basePath: '/admin',
});

// Use with any server
Deno.serve(handler);
```

## Features

- [x] Schema introspection
- [x] Field type mapping (column → CMS field)
- [x] Zod validation via drizzle-zod
- [x] Server-rendered HTML forms (zero JS dependencies)
- [x] XSS-safe template literals with auto-escaping
- [x] List, detail, and edit views
- [x] HTML5 native form validation (required, maxlength, pattern)
- [x] Auto-generated CRUD routes (BYOS: Bring Your Own Server)
- [x] Web Standard Request/Response handlers
- [ ] Relation field pickers
- [ ] File uploads (local + S3)
- [ ] Session auth (cookie-based)
- [ ] RLS policy integration (Postgres)
- [ ] Audit logging
- [ ] Customizable UI components

## Database Support

| Database | Status | Notes |
|----------|--------|-------|
| PostgreSQL | ✅ Primary | Full feature support including RLS, arrays, enums |
| MySQL | 🔮 Planned | Core features, no RLS |
| SQLite | 🔮 Planned | Lightweight/edge deployments |

The core schema introspection is database-agnostic via Drizzle's abstractions. Postgres-specific features (RLS, arrays, enums) degrade gracefully on other databases.

## Development

This project is developed with **Deno** — no Node.js or npm required locally.

```bash
# Clone
git clone https://github.com/yourname/drizzle-cms
cd drizzle-cms

# Run tests
deno test

# Type check
deno check packages/*/mod.ts

# Format
deno fmt

# Lint
deno lint

# Build npm packages (for publishing)
deno task build:npm
```

Node.js compatibility is tested in CI and achieved via JSR + `dnt` for npm publishing.

## Stack

| Layer | Package | Deps |
|-------|---------|------|
| Schema | `drizzle-orm` | 0 |
| Database | `postgres` (postgres.js) | 0 |
| Validation | `zod` | 0 |
| Schema→Zod | `drizzle-zod` | 0 |
| **Total** | | **0 transitive** |

> **Why Postgres?** Full-featured (RLS, arrays, JSONB, enums), excellent Drizzle support, and the `postgres` driver is zero-dependency. The architecture allows adding MySQL/SQLite adapters later without breaking changes.

## License

MIT
