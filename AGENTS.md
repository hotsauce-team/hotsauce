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
- Handlers use Web Standard `Request`/`Response` (works in Deno, Node 20+, Bun, Workers)
- BYOS (Bring Your Own Server) architecture — users wire handlers to their server

## Package Boundaries

| Package | Purpose | Runtime APIs | DB-Specific Code | DB-Specific Tests |
|---------|---------|--------------|------------------|-------------------|
| `core` | Schema introspection, field mapping, validation | ❌ None | ❌ Generic only | ✅ PGlite + sql.js |
| `ui` | HTML generation, form rendering | ❌ None | ❌ Generic only | ❌ None |
| `handlers` | CRUD route handlers (Request → Response) | ❌ Web Standard only | ❌ Generic only | ✅ PGlite + sql.js |

## Database Guidelines

### Database-Agnostic Design
- Core schema introspection must work with **any** Drizzle schema (pg, mysql, sqlite)
- Use Drizzle's generic types in core, not `drizzle-orm/pg-core` directly
- Database-specific features (arrays, enums, JSON) should:
  - Live in database-specific modules or be feature-detected
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

// Bad: assume a specific database
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
├── styles.ts           # CSS stylesheet content
├── forms/
│   ├── inputs.ts       # Individual input renderers (text, select, etc.)
│   ├── field.ts        # Form field with label/error wrapper
│   └── form.ts         # Complete form with fields and buttons
├── views/
│   ├── list.ts         # Table listing records
│   ├── detail.ts       # Single record view
│   └── edit.ts         # Edit/create form view
└── components/
    ├── layout.ts       # Page layout, sidebar
    ├── alert.ts        # Flash messages
    └── pagination.ts   # Page navigation

packages/handlers/
├── mod.ts              # Main entry, exports createCmsHandler
├── README.md           # Package documentation
├── router.ts           # URL routing and method dispatch
├── crud.ts             # List, create, read, update, delete handlers
├── crud-helpers.ts     # Internal CRUD utilities
├── http.ts             # Response helpers, form parsing
├── csrf.ts             # CSRF token generation and validation
├── styles.ts           # Stylesheet route handler
├── validation.ts       # Zod config validation
├── runtime-compat.ts   # Cross-runtime env var utilities (getEnv)
├── types.ts            # Handler types (CmsOptions, ErrorContext, etc.)
├── auth/               # JWT authentication module
└── plugins/            # Plugin registry, service, and types
    ├── types.ts        # Plugin, PluginConfig, re-exports from handlers-workers
    ├── registry.ts     # Plugin registration and validation
    └── service.ts      # Plugin execution orchestration

packages/handlers-workers/
├── mod.ts              # Main entry, exports WorkerExecutor
├── README.md           # Package documentation
├── types.ts            # Serializable, PluginContext, ActionContext, etc.
├── executor.ts         # Worker management and communication
└── sandbox/
    └── worker-script.ts  # Code that runs inside Workers

packages/plugins/
├── mod.ts              # Main entry, re-exports plugins and types
├── README.md           # Package documentation
└── audit-log/
    ├── mod.ts          # createAuditLogPlugin factory
    └── worker.ts       # Worker module for isolation
```

## Environment Variables

The CMS uses these environment variables for secrets (can also be passed directly):

| Variable | Purpose |
|----------|---------|
| `CMS_CSRF_SECRET` | CSRF token signing (32+ chars) |
| `CMS_JWT_SECRET` | JWT signing for auth (32+ chars) |

## Development Environment

- **Deno is the primary development runtime** — no Node.js/npm required locally
- All commands use `deno` CLI
- Do NOT suggest `npm`, `npx`, `yarn`, or `pnpm` commands for development
- Node compatibility is achieved via JSR publishing and `dnt` build step

### Deno Permissions

- **ALWAYS use `deno task test`** or `deno test -P --parallel` — never pass `--allow-*` flags manually
- **For debugging**, use `deno task test:debug` or `deno test -P` (sequential execution)
- **Never use broad permission flags** like `--allow-env`, `--allow-read`, `--allow-net`, `--allow-ffi`
- **Never set `"read": true`** or any permission to `true` in config
- All test permissions are pre-configured in `deno.jsonc` under `test.permissions`
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

- Run tests with `deno task test` or `deno test -P --parallel` (fast, parallel execution)
- For debugging test failures, use `deno task test:debug` or `deno test -P` (sequential)
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
3. **Hardcoding database-specific types in core** — breaks extensibility
4. **Mixing concerns** — keep schema logic, UI, and HTTP handling separate
5. **Forgetting feature detection** — not all DBs support arrays, enums, JSON, etc.
6. **Silent failures** — errors should either be logged via `onError` and/or block the operation with a user-facing message; never silently pass through

## Internal Design Notes (Reference)

### Plugin Architecture

Plugins extend the CMS with custom hooks that run during CRUD operations. Key design decisions:

**Worker Isolation (Security)**
- Plugins run in Web Workers, isolated from the main thread
- Plugins never receive database handles, server internals, or functions
- All data crossing the Worker boundary must be JSON-serializable
- This "secure by default" approach protects against malicious or buggy plugins

**Module-Based Loading**
- Plugins provide a `moduleUrl` pointing to a Worker-compatible module
- The Worker imports this module and calls `createPlugin(config)` factory
- Config is serialized and passed to the Worker at initialization
- This allows plugins to have complex logic while keeping the main thread simple

```typescript
// Main entry (audit-log.ts) - for type checking and registration
export function createAuditLogPlugin(config: Config): Plugin {
  return {
    name: 'audit-log',
    moduleUrl: new URL('./audit-log.worker.ts', import.meta.url).href,
    hooks: { /* defined for type checking */ },
  };
}

// Worker module (audit-log.worker.ts) - actually runs in isolation
export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  return { hooks: { on: { create: handler } } };
}
```

**Hook Categories**
- **Transform hooks** (`beforeSave`, `afterRead`): Modify data, always block
- **Action hooks** (`on.create`, `on.update`, etc.): Side effects, optionally fire-and-forget

**Serializable Constraint**
- All data passed to plugins: `Serializable` type (primitives, arrays, plain objects, Date)
- No functions, class instances, symbols, or circular references
- Plugins receive snapshots of data, not live references

### Plugin Development Guidelines

When creating plugins:
1. **Keep Worker module self-contained** — it cannot import from main thread modules
2. **Use `createPlugin(config)` factory** — receives serialized config from CMS options
3. **Declare capabilities** — network hosts, actions needed (for future permission enforcement)
4. **Use `fireAndForget: true`** for logging/analytics that shouldn't block requests
5. **Test without Worker first** — easier to debug, then verify Worker isolation works

### Uploads: What belongs in core vs plugin

**First-class (core)** (so the CMS feels complete even without storage):

- A `file` field type in the field mapping + UI rendering contract
- A standard file reference shape stored in tables (e.g. `{ key/id, filename, contentType, size, url? }` or an `uploadId` FK)
- Basic display conventions (filename/size; link when `url` exists)
- Core can render + validate a file reference; core does not move bytes

**Official plugin** (environment + storage concerns):

- Multipart parsing + upload endpoints
- Storage adapter calls (`put/get/delete`)
- Optional direct-to-bucket / presigned URL flow (S3/R2-style)
- Virus scanning / transformations (if ever)
- Cleanup policies (orphan GC, retention)
