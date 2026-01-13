# AGENTS.md

Guidelines for AI coding assistants working on this project.

## Core Constraints

### Dependencies
- **ONLY** these production dependencies are allowed:
  - `drizzle-orm`
  - `postgres` (postgres.js driver)
  - `zod`
  - `drizzle-zod`
- Do NOT suggest adding any other production packages
- All four packages have zero transitive dependencies — keep it that way

### Dev Dependencies (testing only)
- `@electric-sql/pglite` — in-memory Postgres for tests
- `sql.js` — in-memory SQLite for tests
- `@std/assert` — Deno standard library assertions
- Dev dependencies are OK since they don't ship to users

### Runtime Compatibility
- All packages must be **runtime-agnostic**
- No `Deno.*` or Node-specific APIs — use Web Standard APIs only
- Handlers use Web Standard `Request`/`Response` (works in Deno, Node 18+, Bun, Workers)
- BYOS (Bring Your Own Server) architecture — users wire handlers to their server

## Package Boundaries

| Package | Purpose | Runtime APIs | DB-Specific Code |
|---------|---------|--------------|------------------|
| `core` | Schema introspection, field mapping, validation | ❌ None | ❌ Generic only |
| `ui` | HTML generation, form rendering | ❌ None | ❌ Generic only |
| `handlers` | CRUD route handlers (Request → Response) | ❌ Web Standard only | ✅ Postgres OK |
| `storage` | File upload storage abstraction | ✅ Deno APIs in deno-fs.ts | ❌ Generic only |

## Database Guidelines

### Postgres-First, Extensible Design
- Postgres is the primary supported database
- Core schema introspection must work with **any** Drizzle schema (pg, mysql, sqlite)
- Use Drizzle's generic types in core, not `drizzle-orm/pg-core` directly
- Postgres-specific features (RLS, arrays, enums) should:
  - Live in Postgres-specific modules or be feature-detected
  - Degrade gracefully when not available

### Drizzle ORM Helper Functions
- **Use exported helper functions** instead of direct symbol/property access
- Drizzle exports utilities like `getTableName`, `getTableColumns`, `isTable`
- These provide type-safe access without needing `as unknown as` casts

```typescript
// Good: use Drizzle's helpers
import { getTableName, getTableColumns, Table } from 'drizzle-orm';

const name = getTableName(table);           // type-safe
const cols = getTableColumns(table);        // returns typed columns object

// Bad: direct symbol access
const TABLE_NAME = Symbol.for('drizzle:Name');
const name = (table as any)[TABLE_NAME];    // loses type safety
```

- For properties without helpers (e.g., foreign keys), use symbol access with appropriate casts
- Check drizzle-orm's exports before adding custom symbol lookups

### Feature Detection Pattern
```typescript
// Good: detect capabilities
const capabilities = detectCapabilities(schema);
if (capabilities.arrays) {
  // handle array fields
}

// Bad: assume Postgres
import { pgTable } from 'drizzle-orm/pg-core';
```

## Code Style

- Prefer **functions over classes** for utilities
- Use **explicit types** for public API function signatures
- Use **template literals** for HTML generation (no JSX in core/ui)
- Keep functions **pure** where possible — side effects in server packages

### UI Package Guidelines
- Use the `html` tagged template from `packages/ui/html.ts` for XSS-safe HTML
- Interpolated values are auto-escaped; use `raw()` for trusted HTML
- Use `attrs()` helper to build attribute strings safely
- HTML5 validation attributes (required, maxlength, pattern) for client-side validation
- No client-side JavaScript dependencies — pure server-rendered HTML
- All form submissions use standard `<form>` POST — no AJAX

```typescript
// Good: auto-escaped template
import { html, raw, attrs } from '@drizzle-cms/ui';

html`<input ${attrs({ name, value: userInput })} />`;  // userInput is escaped
html`<div>${raw(trustedHtml)}</div>`;                  // explicitly trusted

// Bad: string concatenation
`<input value="${userInput}" />`;  // XSS vulnerability
```

## File Organization

Each package has a README with detailed API documentation:
- [`packages/core/README.md`](packages/core/README.md) — Schema introspection, field mapping
- [`packages/ui/README.md`](packages/ui/README.md) — HTML generation, forms, views
- [`packages/handlers/README.md`](packages/handlers/README.md) — CRUD handlers, routing
- [`packages/storage/README.md`](packages/storage/README.md) — File upload storage abstraction

```
packages/core/
├── mod.ts              # Main entry, re-exports public API
├── README.md           # Package documentation
├── schema/
│   ├── introspect.ts   # Extract metadata from Drizzle schemas
│   └── types.ts        # Shared type definitions
├── fields/
│   └── mapping.ts      # Column type → CMS field mapping
└── validation/
    └── zod.ts          # Re-exports drizzle-zod

packages/ui/
├── mod.ts              # Main entry
├── README.md           # Package documentation
├── html.ts             # Tagged template with auto-escaping
├── forms/
│   ├── inputs.ts       # Individual input renderers (text, select, etc.)
│   ├── field.ts        # Form field with label/error wrapper
│   └── form.ts         # Complete form with fields and buttons
├── views/
│   ├── list.ts         # Table listing records
│   ├── detail.ts       # Single record view
│   └── edit.ts         # Edit/create form view
└── components/
    ├── layout.ts       # Page layout, sidebar, CSS
    ├── alert.ts        # Flash messages
    └── pagination.ts   # Page navigation

packages/handlers/
├── mod.ts              # Main entry, exports createCmsHandler
├── README.md           # Package documentation
├── router.ts           # URL routing and method dispatch
├── crud.ts             # List, create, read, update, delete handlers
├── types.ts            # Handler types (CmsOptions, etc.)
└── utils.ts            # Response helpers, form parsing

packages/storage/
├── mod.ts              # Main entry, re-exports all
├── README.md           # Package documentation
├── storage.ts          # StorageBackend interface, utilities (runtime-agnostic)
└── deno-fs.ts          # Deno filesystem implementation (uses Deno.* APIs)
```

## Development Environment

- **Deno is the primary development runtime** — no Node.js/npm required locally
- All commands use `deno` CLI
- Do NOT suggest `npm`, `npx`, `yarn`, or `pnpm` commands for development
- Node compatibility is achieved via JSR publishing and `dnt` build step

### Deno Permissions

- **Never use broad permission flags** like `--allow-env`, `--allow-read`, `--allow-net`
- **Never set `"read": true`** or any permission to `true` in config
- Always use **fine-grained permissions** in `deno.jsonc` via the `permissions` block
- Specify exact paths, hosts, and env vars needed
- Use `DENO_DIR=.deno_cache` to keep npm cache local and permission-friendly
- Example:
  ```jsonc
  "permissions": {
    "read": ["./packages", "./.deno_cache"],
    "env": ["DATABASE_URL"],
    "net": ["localhost:5432"]
  }
  ```

## Testing

- Run tests with `deno test -P` (uses permissions from config)
- Tests should run on both Deno and Node where applicable (CI will test Node)
- Use `Deno.test()` for all test files
- Core/UI tests should be runtime-agnostic (test the logic, not the runtime)

### Test File Organization

```
packages/core/tests/
├── schema_test.ts       # Schema metadata inspection (Postgres + SQLite)
├── introspect_test.ts   # Table/relation introspection
├── mapping_test.ts      # Column → field mapping
├── validation_test.ts   # Zod schema generation (Postgres + SQLite)
├── integration_test.ts  # PGlite + sql.js database tests
└── fixtures/
    ├── schema-pg.ts     # Postgres test schema
    └── schema-sqlite.ts # SQLite test schema
```

- **Schema tests**: Verify Drizzle exposes expected metadata on tables/columns
- **Integration tests**: Verify test fixtures work with real in-memory databases
- Both Postgres and SQLite schemas are tested to ensure cross-database compatibility

## Common Mistakes to Avoid

1. **Adding dependencies** — find a zero-dep solution or use built-in APIs
2. **Using Deno.* in core** — breaks Node compatibility
3. **Hardcoding Postgres types in core** — breaks extensibility
4. **Mixing concerns** — keep schema logic, UI, and HTTP handling separate
5. **Forgetting feature detection** — not all DBs support arrays, RLS, etc.
