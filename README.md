# hotsauce-cms

A schema-driven headless CMS derived from your Drizzle ORM definitions. Define your database schema once — get a type-safe admin interface for free.

## Philosophy

- **Single source of truth**: Your Drizzle schema defines database tables, TypeScript types, validation rules, AND CMS fields
- **Minimal dependencies**: Core stack is `drizzle-orm` + `zod` + `drizzle-zod` + `@std/media-types` (all zero transitive deps)
- **Secure by default**: CSRF protection, JWT auth, row-level policies, column-level policies, XSS-safe templates
- **Flexible & extensible**: Pluggable auth, custom validation, row & column policies, plugins with Worker isolation
- **Cross-runtime**: Works in Deno and Node.js — Web Standard `Request`/`Response` everywhere
- **Database-agnostic**: Works with any Drizzle-supported database (Postgres, MySQL, SQLite)

## Installation

```bash
# Deno
deno add jsr:@hotsauce/core jsr:@hotsauce/ui jsr:@hotsauce/cms

# Node
npx jsr add @hotsauce/core @hotsauce/ui @hotsauce/cms
```

## Quick Start

```typescript
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
  auth: 'dangerously-open', // No authentication (dev mode)
});

// Use with any server
Deno.serve(handler);
```

## Packages

Each package has its own README with detailed API documentation:

| Package                                  | Purpose                                         | Docs                                 |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| [`@hotsauce/core`](packages/core/)       | Schema introspection, field mapping, validation | [README](packages/core/README.md)    |
| [`@hotsauce/ui`](packages/ui/)           | HTML generation, form rendering, views          | [README](packages/ui/README.md)      |
| [`@hotsauce/cms`](packages/cms/)         | CRUD route handlers (Request → Response)        | [README](packages/cms/README.md)     |
| [`@hotsauce/auth`](packages/auth/)       | JWT, password hashing, TOTP, account management | [README](packages/auth/README.md)    |
| [`@hotsauce/workers`](packages/workers/) | Plugin runtime with Worker isolation            | [README](packages/workers/README.md) |
| [`@hotsauce/plugins`](packages/plugins/) | Official plugins (audit-log, puck, s3-storage)  | [README](packages/plugins/README.md) |

```
packages/
├── core/              # Schema introspection, field mapping, validation
│   │                  # Runtime-agnostic, zero Deno/Node specific code
│   ├── schema/        # Schema parsing and metadata extraction
│   ├── fields/        # Column type → CMS field mapping
│   ├── extend/        # $cms() column/table metadata
│   └── validation/    # drizzle-zod integration
│
├── ui/                # HTML generation, form rendering
│   │                  # Pure functions returning strings, zero dependencies
│   ├── html.ts        # Tagged template with auto-escaping
│   ├── forms/         # Form field renderers (text, select, etc.)
│   ├── views/         # List, detail, edit views
│   └── components/    # Layout, pagination, alerts
│
├── cms/               # CRUD route handlers (Web Standard Request/Response)
│   │                  # Bring Your Own Server - works with any framework
│   ├── router.ts      # URL routing and handler dispatch
│   ├── crud.ts        # List, create, read, update, delete handlers
│   ├── plugins/       # Plugin registry and service (uses workers)
│   ├── policies/      # Row and column-level security
│   └── tokens/        # CSRF, source token utilities
│
├── auth/              # Authentication and authorization
│   │                  # JWT, password hashing, TOTP 2FA, account management
│   ├── jwt.ts         # JWT sign/verify (HMAC-SHA256)
│   ├── password.ts    # PBKDF2-SHA256 password hashing
│   ├── totp.ts        # RFC 6238 TOTP utilities
│   └── account/       # Self-service account management
│
├── workers/           # Plugin runtime with Worker isolation
│   │                  # Compatible with Deno and Node.js 20+
│   ├── executor.ts    # Manages Worker instances and in-process plugins
│   ├── guard.ts       # Worker context detection
│   └── validate.ts    # Serialization validation
│
└── plugins/           # Official plugins
    ├── audit-log/     # Logs all CRUD operations
    ├── puck/          # Puck visual editor integration
    └── s3-storage/    # S3/R2/MinIO file storage
```

## Bring Your Own Server

The handlers package exports a single function that returns a Web Standard `Request → Response` handler. Wire it up to any server:

```typescript
import { createCmsHandler } from '@hotsauce/cms';
import * as schema from './schema.ts';

const handler = createCmsHandler({
  schema,
  db,
  basePath: '/admin',
  auth: 'dangerously-open', // Or { provider: ..., policies: ... } or { external: ... }
});

// Deno
Deno.serve(handler);

// Node 20+
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

| Drizzle Type                          | CMS Field  | Notes                                 |
| ------------------------------------- | ---------- | ------------------------------------- |
| `varchar`                             | `text`     | With maxLength from column def        |
| `text`                                | `textarea` | Override to `richtext` via hint       |
| `boolean`                             | `checkbox` |                                       |
| `integer` / `real`                    | `number`   |                                       |
| `timestamp`                           | `datetime` |                                       |
| `date`                                | `date`     |                                       |
| `json` / `jsonb`                      | `object`   | Requires sub-schema hint              |
| `text[]` / arrays                     | `list`     | Postgres-only                         |
| `pgEnum`                              | `select`   | Postgres-only                         |
| Foreign key                           | `relation` | Auto-detected from references         |
| `json/jsonb` + `$cms({ file: true })` | `file`     | Multipart upload + file serving route |

## Relationships

### Foreign Keys (One-to-Many)

Foreign key columns are automatically detected and rendered as select dropdowns:

```typescript
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  authorId: integer('author_id').references(() => users.id), // → Select dropdown
});
```

The CMS will:

- Show a dropdown with all users on the edit form
- Display the related record's name (e.g., "Alice Johnson") in list and detail views
- Format as "ID (Name)" for clarity (e.g., "1 (Alice Johnson)")

### Many-to-Many (Junction Tables)

Junction tables are automatically detected and rendered as checkbox lists:

```typescript
export const postCategories = pgTable('post_categories', {
  postId: integer('post_id').notNull().references(() => posts.id),
  categoryId: integer('category_id').notNull().references(() => categories.id),
}, (table) => [
  primaryKey({ columns: [table.postId, table.categoryId] }),
]);
```

The CMS will:

- Detect junction tables (2 FKs to different tables)
- Hide junction tables from navigation
- Show checkbox list on the edit form for related records
- Display comma-separated values in list and detail views (e.g., "Technology, Design")

## Custom Validation Parsers

By default, the CMS auto-generates validation schemas from your Drizzle tables using `drizzle-zod`. For custom validation (email formats, password strength, etc.), pass your own parsers:

```typescript
import { z } from 'zod';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import type { Parsers } from '@hotsauce/cms';

// Extend drizzle-zod schemas with custom rules
const usersInsertSchema = createInsertSchema(users, {
  email: z.string().email(), // Add email format validation
});
const usersUpdateSchema = createUpdateSchema(users, {
  email: z.string().email().optional(),
});

// Parsers are validation-library agnostic
// Any function that takes unknown data and returns parsed data (or throws) works
const parsers: Parsers = {
  users: {
    insert: (data) => usersInsertSchema.parse(data),
    update: (data) => usersUpdateSchema.parse(data),
  },
};

const handler = createCmsHandler({
  db,
  schema,
  auth: 'dangerously-open',
  parsers, // Tables without custom parsers use auto-generated schemas
});
```

The parser interface is simple — any validation library works:

```typescript
interface TableParsers {
  insert?: (data: unknown) => unknown; // For create operations
  update?: (data: unknown) => unknown; // For edit operations
}
```

## Extension Points

| Option     | Purpose                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| `auth`     | Authentication: `'dangerously-open'` or `{ provider, ... }` (JWT)        |
| `policies` | Row-level security with SQL conditions + column-level read/write control |
| `parsers`  | Custom validation (Zod, Valibot, Arktype, or any library)                |
| `onError`  | Error logging integration (Sentry, Datadog, etc.)                        |

## Features

- [x] Schema introspection
- [x] Field type mapping (column → CMS field)
- [x] Zod validation via drizzle-zod (auto-generated)
- [x] Custom validation parsers (library-agnostic)
- [x] Server-rendered HTML forms (zero JS dependencies)
- [x] XSS-safe template literals with auto-escaping
- [x] List, detail, and edit views
- [x] HTML5 native form validation (required, maxlength, pattern)
- [x] Auto-generated CRUD routes (BYOS: Bring Your Own Server)
- [x] Web Standard Request/Response handlers
- [x] Relation field pickers (FK → select dropdown with display labels)
- [x] Many-to-many relationships (junction table detection, checkbox UI)
- [x] Column metadata hints via `$cms()` (file, hidden, readOnly)
- [x] Table metadata hints via `$cms()` (frontendUrl, hidden)
- [x] JWT authentication (cookie-based tokens)
- [x] Two-factor authentication (TOTP)
- [x] External authentication (reverse proxy / OAuth integration)
- [x] Row-level security policies (atomic authorization)
- [x] Column-level access control (read/write policies per field)
- [x] Multi-tenant compatibility (shared database with tenant column)
- [x] Plugin system with Worker isolation (Deno + Node.js 20+)
- [x] File uploads (base64 in DB, validation, serving route)
- [x] Publish alpha release to jsr (Deno support)
- [x] File uploads (S3/R2 cloud storage adapter)
- [x] Media library UI (browse, search, reuse previously uploaded files)
- [ ] Regression tests on demo app, e.g. catch CSP violations.
- [ ] Shared policy API (reuse CMS row/column policies in your app routes)
- [ ] Security disclosure policy
- [ ] Add tests for NodeJS runtime
- [ ] S3 orphan garbage collection (cleanup objects not referenced by any record)
- [ ] Expose plugin utilities for frontend use (e.g., S3 signed download URLs)
- [ ] Search for list and grid views (full-text search, filters, pagination)
- [ ] Native CDN support (public + private files, cache invalidation)
- [ ] Plugin config - timeout, worker response validation, load testing
- [ ] Plugin permission approval (env var hash or DB table gate for CSP/capability changes)
- [ ] Plugin data obfuscation (PII/credential redaction)
- [ ] Audit logging
- [ ] 2FA backup codes (recovery codes for lost authenticator)
- [ ] Customizable UI components
- [ ] Seamless plugin UI (in-page S3 uploads and block editing without navigation)

Schema hints example:

```ts
import '@hotsauce/core/extend';
import { jsonb, pgTable } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  avatar: jsonb('avatar').$cms({ file: true }),
});
```

## Database Support

| Database   | Status     | Notes                                        |
| ---------- | ---------- | -------------------------------------------- |
| PostgreSQL | ✅ Primary | Full feature support including arrays, enums |
| SQLite     | ✅ Tested  | Lightweight/edge deployments, text enums     |
| MySQL      | 🔮 Planned | Core features work, needs integration tests  |

The core schema introspection is database-agnostic via Drizzle's abstractions. Database-specific features (arrays, native enums) degrade gracefully on other databases.

## Development

This project is developed with **Deno** — no Node.js or npm required locally.

Node.js and npm are used **only** to validate the generated npm packages:

- **CI:** runs Node.js compatibility tests for the npm build output
- **Local (optional):** `deno task test:npm` runs the same Node.js E2E tests in Docker

```bash
# Clone
git clone https://github.com/hotsauce-team/hotsauce
cd hotsauce

# Enable pre-commit hooks (runs fmt/lint/check)
git config core.hooksPath .githooks && \
chmod +x .githooks/pre-commit

# Run tests
deno task test

# Type check
deno check packages/*/mod.ts

# Format
deno fmt

# Lint
deno lint

# Run all checks manually
deno task hooks:run

# Build npm packages (for publishing)
deno task build:npm
```

Node.js compatibility is tested in CI and achieved via JSR + `dnt` for npm publishing.

## Stack

| Layer           | Package       | Transitive Deps |
| --------------- | ------------- | --------------- |
| ORM             | `drizzle-orm` | 0               |
| Validation      | `zod`         | 0               |
| Schema→Zod      | `drizzle-zod` | 0               |
| Database Driver | User's choice | Varies          |

All direct dependencies have **zero transitive dependencies**. You bring your own database driver (`postgres`, `better-sqlite3`, `mysql2`, etc.).

## License

MIT
