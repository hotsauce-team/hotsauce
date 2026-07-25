# @hotsauce/cms

CRUD route handlers for the CMS admin interface using Web Standard Request/Response.

## Installation

```ts
import { createCmsHandler } from '@hotsauce/cms';
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              @hotsauce/cms                                   │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────────────────┤
│  mod.ts  │router.ts │ crud.ts  │ http.ts  │ csrf.ts  │styles.ts │   validation.ts    │
│          │          │          │          │          │          │                    │
│  Main    │  URL     │  CRUD    │  HTTP    │  CSRF    │  CSS     │   Config           │
│  handler │  parsing │  handlers│  response│  token   │  route   │   validation       │
│  factory │  + routes│          │  helpers │  utils   │  handler │   (Zod)            │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────────────────┘
     ↓          ↓          ↓          ↓          ↓          ↓            ↓
  Entry pt   Route     List/CRUD   Responses  Security  Stylesheet   Throws on
  for srvs   matching  operations  redirects  tokens    serving      invalid config
```

## Design Principles

- **Web Standard APIs**: Uses `Request` and `Response` (no framework lock-in)
- **BYOS (Bring Your Own Server)**: Works with Deno, Node 20+, Bun, Workers
- **Database-agnostic routing**: CRUD logic works with any Drizzle dialect
- **Postgres query execution**: Actual database queries use Drizzle's Postgres driver

## Quick Start

```ts
import { createCmsHandler } from '@hotsauce/cms';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

// Option 1: Use environment variables (recommended)
// Set CMS_CSRF_SECRET and CMS_JWT_SECRET in your environment
const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
});

// Option 2: Pass secrets directly
const handler2 = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  csrfSecret: process.env.CSRF_SECRET!,
  auth: {
    secret: process.env.JWT_SECRET!,
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
  },
});

// Deno
Deno.serve(handler);

// Node 20+ (with adapter)
// Hono: app.all('/admin/*', (c) => handler(c.req.raw));
// Express: app.use('/admin', expressAdapter(handler));
```

## Environment Variables

| Variable          | Purpose                                 | Required                                       |
| ----------------- | --------------------------------------- | ---------------------------------------------- |
| `CMS_2FA_SECRET`  | 2FA challenge token signing (32+ chars) | Yes, if using PasswordProvider with 2FA        |
| `CMS_CSRF_SECRET` | CSRF token signing (32+ chars)          | Yes, if not passed in options                  |
| `CMS_JWT_SECRET`  | JWT signing for auth (32+ chars)        | Yes, if auth enabled and not passed in options |

Generate secrets with:

```bash
openssl rand -base64 32
```

## Modules

### `mod.ts` - Main Entry Point

| Export                           | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `createCmsHandler(options)`      | Create the main CMS handler                            |
| `CmsOptions`                     | Configuration options type                             |
| `CmsAuthOptions`                 | Auth configuration type                                |
| `Handler`                        | `(Request) => Response` type                           |
| `CrudAction`                     | `'list' \| 'read' \| 'create' \| 'update' \| 'delete'` |
| `generateCsrfToken()`            | Generate signed CSRF token                             |
| `validateCsrfToken(token)`       | Validate CSRF token (signature + expiry)               |
| `getEnv(key)`                    | Get environment variable (cross-runtime)               |
| `requireEnv(key, desc)`          | Get required env var or throw                          |
| `PasswordProvider`               | Password-based auth with optional 2FA                  |
| `hashPassword(password)`         | Hash password with PBKDF2-SHA256                       |
| `verifyPassword(password, hash)` | Verify password against hash                           |
| `generateTOTP(secret)`           | Generate a 6-digit TOTP code                           |
| `verifyTOTP(token, secret)`      | Verify a TOTP code (with ±30s tolerance)               |
| `generateTOTPSecret()`           | Generate a random TOTP secret (base32)                 |
| `generateTOTPUri(...)`           | Generate otpauth:// URI for QR codes                   |

**Example:**

```ts
import { createCmsHandler, PasswordProvider } from '@hotsauce/cms';
import { ownedBy } from '@hotsauce/cms/policies';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  title: 'Blog Admin',
  auth: {
    provider: new PasswordProvider({ db, usersTable: schema.users }),
  },
  policies: {
    posts: ownedBy(schema.posts, 'authorId'),
  },
});
```

### `runtime-compat.ts` - Cross-Runtime Utilities

| Export                         | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `getEnv(key)`                  | Get env var (works in Deno, Node, Bun, Workers)  |
| `requireEnv(key, description)` | Get required env var or throw with helpful error |

**Example:**

```ts
import { getEnv, requireEnv } from '@hotsauce/cms';

// Optional: returns undefined if not set
const debugMode = getEnv('DEBUG');

// Required: throws if not set
const secret = requireEnv('JWT_SECRET', 'JWT signing secret');
```

### `router.ts` - URL Routing

| Export                                   | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `parseRoute(url, basePath, tables)`      | Parse URL to route info                       |
| `resolveAction(route, method)`           | Determine CRUD action from HTTP method        |
| `cmsUrl(basePath, table?, action?, id?)` | Generate CMS URLs                             |
| `formatTableName(name)`                  | `posts_to_categories` → `Posts To Categories` |
| `formatColumnName(name)`                 | `author_id` → `Author Id`                     |

**URL Patterns:**

| URL                       | Method | Action        |
| ------------------------- | ------ | ------------- |
| `/admin`                  | GET    | Dashboard     |
| `/admin/posts`            | GET    | List posts    |
| `/admin/posts/new`        | GET    | Create form   |
| `/admin/posts/new`        | POST   | Create record |
| `/admin/posts/123`        | GET    | View post     |
| `/admin/posts/123/edit`   | GET    | Edit form     |
| `/admin/posts/123/edit`   | POST   | Update record |
| `/admin/posts/123/delete` | POST   | Delete record |

**Example:**

```ts
import { cmsUrl } from '@hotsauce/cms';

cmsUrl('/admin'); // '/admin'
cmsUrl('/admin', 'posts'); // '/admin/posts'
cmsUrl('/admin', 'posts', 'read', '123'); // '/admin/posts/123'
cmsUrl('/admin', 'posts', 'edit', '123'); // '/admin/posts/123/edit'
cmsUrl('/admin', 'posts', 'new'); // '/admin/posts/new'
```

### `crud.ts` - CRUD Handlers

Internal handlers for each CRUD operation. These are called by the main handler.

| Handler           | Action                          | Description               |
| ----------------- | ------------------------------- | ------------------------- |
| `handleDashboard` | GET `/admin`                    | Shows table list          |
| `handleList`      | GET `/admin/:table`             | Paginated table/grid view |
| `handleRead`      | GET `/admin/:table/:id`         | Single record view        |
| `handleCreate`    | GET/POST `/admin/:table/new`    | Create form/submit        |
| `handleUpdate`    | POST `/admin/:table/:id/edit`   | Update record             |
| `handleDelete`    | POST `/admin/:table/:id/delete` | Delete record             |

> **Grid view:** Tables with a `thumbnail: true` column automatically use a thumbnail grid instead of a table. Users can toggle between grid and table via `?view=grid` / `?view=table`. Clicking a grid item opens an RHS detail panel (`?selected=<id>`) for inline editing without leaving the list.

> **Picker mode:** Add `?picker=true&__cms_source=<token>` to the list URL to get a minimal iframe-embeddable grid for media selection in visual editors like Puck. The `__cms_source` token is a signed plugin identifier (e.g., `plugin:puck`) that controls which columns are included in the postMessage data. Without a valid token, picker mode returns 403 Forbidden.
>
> **Security:** By default, picker mode only sends the primary key. All other columns (including the file column) require explicit opt-in via `$cms({ plugins: { puck: { role: 'source' } } })`. The `thumbnail: true` option controls grid rendering; `role: 'source'` controls data exposure. See the `@hotsauce/ui` README for postMessage shape details.

#### Plugin column roles

The `role` property inside `$cms({ plugins: { <name>: { role } } })` controls how a column behaves in plugin contexts. `thumbnail` is a separate top-level `$cms()` option for grid rendering.

| Role                     | Form display | Picker / plugin data               | Notes                                           |
| ------------------------ | ------------ | ---------------------------------- | ----------------------------------------------- |
| `role: 'data'` (default) | Shown        | Not included                       | Plugin owns the editing experience for this col |
| `role: 'source'`         | Shown        | **Included** in postMessage record | Explicit opt-in for data exposure to plugin     |
| `role: 'output'`         | **Hidden**   | Not included                       | Computed/derived; never shown in forms          |

`thumbnail: true` and `role: 'source'` are independent — you need both to display a thumbnail in the picker grid _and_ include the file reference in the postMessage payload.

### `http.ts` - HTTP Response Helpers

| Export                            | Purpose                       |
| --------------------------------- | ----------------------------- |
| `htmlResponse(html, status?)`     | Create HTML response          |
| `jsonResponse(data, status?)`     | Create JSON response          |
| `redirect(url, status?)`          | Create redirect response      |
| `redirectWithFlash(url, flash)`   | Redirect with flash message   |
| `parseFlashFromUrl(url)`          | Extract flash from URL params |
| `notFound(message?)`              | 404 response                  |
| `forbidden(message?)`             | 403 response                  |
| `methodNotAllowed(allowed)`       | 405 response                  |
| `parseFormData(request)`          | Parse form submission         |
| `coerceFormValues(data, columns)` | Convert form strings to types |
| `getPagination(url)`              | Extract page/limit from URL   |
| `getSort(url, columns)`           | Extract sort column/direction |
| `wantsJson(request)`              | Check if request wants JSON   |
| `jsonSuccess(...)`                | JSON success response         |
| `jsonValidationError(...)`        | JSON validation error         |
| `jsonError(...)`                  | JSON error (forbidden/404)    |

**Example:**

```ts
import {
  coerceFormValues,
  htmlResponse,
  parseFormData,
  redirect,
} from '@hotsauce/cms';

// Create responses
htmlResponse('<h1>Hello</h1>'); // 200 HTML
htmlResponse('<h1>Error</h1>', 400); // 400 HTML
redirect('/admin/posts'); // 302 redirect

// Parse form data
const formData = await parseFormData(request);
const values = coerceFormValues(formData, table.columns);
// { title: 'Hello', published: true, authorId: 1 }
```

### JSON API for CRUD Operations

CRUD endpoints (`create`, `update`, `delete`) support JSON responses when the request includes `Accept: application/json`. This enables programmatic access and integration with external editors.

**Request:**

```ts
// Option 1: CSRF token in FormData
const response = await fetch('/admin/posts/1', {
  method: 'POST',
  headers: { 'Accept': 'application/json' },
  body: formData, // FormData with __cms_csrf field
});

// Option 2: CSRF token in header (useful for JSON payloads)
const response = await fetch('/admin/posts/1', {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'X-CSRF-Token': csrfToken,
  },
  body: formData,
});
```

**Response formats:**

| Scenario         | HTTP Status | Response Type                 |
| ---------------- | ----------- | ----------------------------- |
| Create success   | 201         | `JsonSuccessResponse`         |
| Update success   | 200         | `JsonSuccessResponse`         |
| Delete success   | 200         | `JsonSuccessResponse`         |
| Validation error | 400         | `JsonValidationErrorResponse` |
| Forbidden        | 403         | `JsonErrorResponse`           |
| Not found        | 404         | `JsonErrorResponse`           |

**Success response:**

```ts
interface JsonSuccessResponse {
  success: true;
  action: 'create' | 'update' | 'delete';
  table: string;
  id: string;  // Always string (from URL or stringified PK)
  redirect: string; // Where HTML response would redirect
}

// Example:
{
  "success": true,
  "action": "update",
  "table": "posts",
  "id": "1",
  "redirect": "/admin/posts/1"
}
```

**Validation error response:**

```ts
interface JsonValidationErrorResponse {
  success: false;
  action: 'create' | 'update' | 'delete';
  table: string;
  id?: string;  // Present for update/delete, absent for create
  errors: {
    _form?: string[];  // Form-level errors (CSRF, general)
    [field: string]: string[] | undefined;  // Field-level errors
  };
}

// Example:
{
  "success": false,
  "action": "create",
  "table": "posts",
  "errors": {
    "title": ["Required"],
    "body": ["Must be at least 10 characters"]
  }
}
```

**Error response (forbidden/not found):**

```ts
interface JsonErrorResponse {
  success: false;
  error: 'forbidden' | 'not_found';
  message: string;
}

// Example:
{
  "success": false,
  "error": "not_found",
  "message": "Record not found."
}
```

**Use case: External editors**

The JSON API enables plugins like visual editors to save data without page reloads:

```ts
// In Puck editor (client-side)
const handlePublish = async (data) => {
  const formData = new FormData();
  formData.append('content', JSON.stringify(data));
  formData.append('__cms_csrf', csrfToken);

  const response = await fetch(`/admin/pages/${pageId}`, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: formData,
  });

  const result = await response.json();
  if (result.success) {
    window.location.href = result.redirect;
  } else {
    showErrors(result.errors);
  }
};
```

### File uploads (MVP)

File uploads are supported by storing a JSON `FileReference` object in a column that is marked as a file field via `$cms({ file: true })`.

- Storage: uploaded bytes are converted to base64 and stored in the JSON field (as `data`).
- Validation: controlled per-column via `$cms({ file: { accept, maxSize } })` (with sensible defaults).
- Forms: the admin automatically switches to `multipart/form-data` when a table has file columns.
- Clearing: file inputs can be cleared on update via a `_clear_<propertyName>` field.

For external storage (S3, R2, MinIO), see the [S3 storage plugin](../plugins/s3-storage/README.md). When configured, uploads go to object storage instead of the database:

**Schema example (Postgres):**

```ts
import '@hotsauce/core/extend';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { FileReference } from '@hotsauce/core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  avatar: jsonb('avatar')
    .$type<FileReference>()
    .$cms({ file: { accept: 'image/*', maxSize: 200_000 } }),
});
```

**With S3 storage:**

```ts
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  // Use the S3 storage provider by id
  storage: 's3',
  // Register the S3 storage plugin
  plugins: [
    createS3StoragePlugin({
      storageId: 's3',
      bucket: 'my-bucket',
      region: 'us-east-1',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      basePath: '/my-bucket',
      accessKeyId: '...',
      secretAccessKey: '...',
    }),
  ],
  // Optionally configure CSP for images served from S3
  csp: {
    imgSrc: ['https://my-bucket.s3.us-east-1.amazonaws.com'],
  },
});
```

**File serving route:**

The handler exposes a read-only route that serves file fields:

- `GET {basePath}/files/{table}/{column}/{id}[/{filename}]`

The optional `{filename}` segment is ignored for lookup (uses `id`), but allows SEO-friendly URLs like `/admin/files/media/file/136/sunset.jpg`.

Access is still filtered through auth + row/column policies.

Notes:

- If the stored `FileReference` includes a `url`, the handler redirects (only to safe URL protocols).
- If the stored `FileReference` includes `data` (base64), the handler serves the bytes with security headers (including `X-Content-Type-Options: nosniff`).

### `csrf.ts` - CSRF Protection

| Export                             | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `generateCsrfToken(secret)`        | Generate HMAC-SHA256 signed token (4-hour expiry) |
| `validateCsrfToken(token, secret)` | Validate signature and check expiry               |
| `getCsrfTokenFromFormData(data)`   | Extract `__cms_csrf` field from form              |
| `getCsrfTokenFromHeader(request)`  | Extract `X-CSRF-Token` header from request        |

**Token Format:** `timestamp.random.signature`

Tokens are signed with HMAC-SHA256 using `crypto.subtle` (Web Crypto API). They are automatically validated on all POST operations (create, update, delete). Invalid or expired tokens show an error message and block the operation.

**Example:**

```ts
import { generateCsrfToken, validateCsrfToken } from '@hotsauce/cms';

// Load secret from environment
const secret = Deno.env.get('CSRF_SECRET')!;

// Generate token for forms (async)
const token = await generateCsrfToken(secret);
// → "lq2abc.0123456789abcdef...signature"

// Validate on submit (async)
const isValid = await validateCsrfToken(token, secret);
// → true (if signature matches and not expired)
```

### `crud-helpers.ts` - CRUD Helpers

Utilities for CRUD operations. Some are exported from mod.ts for custom validation.

| Function                  | Exported | Purpose                             |
| ------------------------- | -------- | ----------------------------------- |
| `validateFormData()`      | ✅       | Validate form data with drizzle-zod |
| `validateWithParsers()`   | ✅       | Validate with custom parser support |
| `formatZodErrors()`       | ✅       | Convert ZodError to field errors    |
| `buildNavItems()`         | ❌       | Build sidebar navigation            |
| `findRecord()`            | ❌       | Fetch single record by ID           |
| `getSafeErrorMessage()`   | ❌       | Sanitize error messages for users   |
| `isForeignKeyViolation()` | ❌       | Detect FK constraint errors         |

### `styles.ts` - External Stylesheet

CSS served as an external file for strict CSP compliance.

| Export               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `cmsStylesheet`      | Raw CSS string for custom serving          |
| `handleStylesheet()` | Route handler returning CSS response       |
| `cssResponse(css)`   | Create a CSS response with caching headers |

The stylesheet is automatically served at `{basePath}/styles.css`. This enables strict Content Security Policy (`style-src 'self'`) without requiring nonces.

### `scripts.ts` - JavaScript Assets

JavaScript for interactive features, served as external files for CSP compliance.

| Export                 | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `handleScript()`       | Main admin.js (sidebar toggle, etc.)      |
| `handlePickerScript()` | Picker JS (postMessage for iframe picker) |

Routes:

- `{basePath}/admin.js` — Main admin JavaScript
- `{basePath}/picker.js` — postMessage handler for picker mode

## Security

### Content Security Policy

All HTML responses include security headers:

```
Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

This policy:

- Restricts all resources to same-origin
- Allows only external stylesheets (no inline `<style>` tags)
- Blocks the CMS from being embedded in iframes (clickjacking protection)
- Limits referrer information leakage

Customize CSP per-directive via the `csp` option:

```ts
csp: {
  imgSrc: ['https://my-bucket.s3.amazonaws.com'],
  connectSrc: ['https://api.example.com'],
  styleSrc: ["'unsafe-inline'"], // Only if needed (e.g., runtime style injection)
}
```

`styleSrc` accepts CSP keywords (`'unsafe-inline'`, `'unsafe-hashes'`), hash sources (`'sha256-...'`), nonce sources (`'nonce-...'`), and URL origins. `'unsafe-eval'` is blocked.

#### Route-Level CSP (Plugins)

Plugins can declare additional CSP sources on individual routes via `PluginRoute.csp`. Route sources are **concatenated** with the global CSP at startup — the route's values are appended to the global directive arrays, so both global and route-level sources apply. Directives not specified on the route inherit the global values unchanged.

```ts
// Plugin route with relaxed style-src (only for this route)
{
  pattern: ':table/:id/:column',
  handler: (ctx) => renderEditor(ctx),
  csp: { styleSrc: ["'unsafe-inline'"] },
}

// Plugin route that needs to fetch from an external origin
{
  pattern: ':table/:id/:column',
  handler: (ctx) => renderUploadPage(ctx),
  csp: { connectSrc: ['https://s3.us-east-1.amazonaws.com'] },
}
```

### CSRF Protection

Forms include CSRF tokens validated on POST. See `csrf.ts` exports.

### Form Validation

By default, form data is validated using auto-generated Zod schemas from `drizzle-zod`. For custom validation (e.g., email format, min/max length), provide custom parsers:

```ts
import { createCmsHandler, type Parsers } from '@hotsauce/cms';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users } from './schema';

// Create schemas with custom refinements
const usersInsertSchema = createInsertSchema(users, {
  email: z.string().email('Invalid email format'),
});
const usersUpdateSchema = createUpdateSchema(users, {
  email: z.string().email('Invalid email format').optional(),
});

// Provide parsers for tables needing custom validation
const parsers: Parsers = {
  users: {
    insert: (data) => usersInsertSchema.parse(data),
    update: (data) => usersUpdateSchema.parse(data),
  },
};

const handler = createCmsHandler({
  db,
  schema,
  parsers,
});
```

Tables without custom parsers use auto-generated `drizzle-zod` schemas. If schema generation fails for a table (e.g., unsupported column type), the operation is blocked and an error is logged via `onError`.

**Validation Types:**

```ts
// Parser function signature (works with Zod, Valibot, or any throwing validator)
type ParserFn = (data: unknown) => unknown;

// Parsers for a single table
interface TableParsers {
  insert?: ParserFn; // For create operations
  update?: ParserFn; // For update operations
}

// All custom parsers keyed by table name
type Parsers = Record<string, TableParsers>;

// Validation result returned by validateFormData()
interface ValidationResult {
  success: boolean;
  data?: Record<string, unknown>; // Validated data (on success)
  errors?: Record<string, string>; // Field-level errors
  formError?: string; // Form-level error message
}
```

**Exported Validation Utilities:**

| Export                                                 | Purpose                                |
| ------------------------------------------------------ | -------------------------------------- |
| `validateFormData(table, values, mode)`                | Validate using drizzle-zod schema      |
| `validateWithParsers(opts, name, table, values, mode)` | Validate with custom parser fallback   |
| `formatZodErrors(zodError)`                            | Convert ZodError to field-keyed errors |

## Error Handling

The library distinguishes between **configuration errors** (programming mistakes) and **runtime errors** (expected failures).

### Configuration Errors (Throws)

Invalid configuration throws `CmsConfigError` at startup:

```ts
import { CmsConfigError, createCmsHandler } from '@hotsauce/cms';

try {
  const handler = createCmsHandler({
    db: null, // ❌ Invalid - throws immediately
    schema: {},
  });
} catch (error) {
  if (error instanceof CmsConfigError) {
    console.error('Config error:', error.message);
    // "Invalid CMS configuration:
    //   - db: db is required and must be a Drizzle database instance
    //   - schema: schema must contain at least one table"
  }
}
```

| Condition                         | Behavior                       |
| --------------------------------- | ------------------------------ |
| `db` is null/undefined            | Throws `CmsConfigError`        |
| `schema` is empty                 | Throws `CmsConfigError`        |
| `basePath` doesn't start with `/` | Throws `CmsConfigError`        |
| `csrfSecret` less than 32 chars   | Throws `CmsConfigError`        |
| Schema introspection fails        | Throws (table not found, etc.) |

### Runtime Errors (HTTP Responses)

Expected failures return appropriate HTTP responses:

| Condition                       | Response                  |
| ------------------------------- | ------------------------- |
| Route not found                 | 404 Not Found             |
| Authentication fails            | 403 Forbidden             |
| Authorization denied            | 403 Forbidden             |
| Record not found                | 404 Not Found             |
| Validation errors               | 400 with form errors      |
| CSRF token invalid              | 403 with error message    |
| Foreign key violation on delete | Error flash message       |
| Unexpected database error       | 500 Internal Server Error |

### Error Logging with `onError`

Unexpected errors (database failures, etc.) return a generic 500 to users. Use `onError` to log details to your monitoring service:

```ts
import { createCmsHandler, ErrorContext } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,

  onError: (error: Error, context: ErrorContext) => {
    if (context.source === 'handler') {
      // HTTP request handler error — has request, url, route
      logger.error('CMS handler error', {
        message: error.message,
        stack: error.stack,
        path: context.url.pathname,
        table: context.table?.name,
        action: context.action,
      });
    } else {
      // Plugin error (fire-and-forget or async) — has plugin name, operation
      logger.error('CMS plugin error', {
        message: error.message,
        plugin: context.plugin,
        operation: context.operation,
        action: context.action,
      });
    }
  },
});
```

> Security note: `onError` context may include request metadata and plugin hook data that can contain secrets or PII. Avoid logging raw `context`, request headers, cookies, form bodies, or `hookContext` without redaction.
>
> Recommended practice:
>
> - Log an allowlist of fields (`requestId`, `plugin`, `operation`, `action`, `path`) instead of full objects.
> - Redact sensitive keys before logging (`authorization`, `cookie`, `token`, `secret`, `password`, `apiKey`).
> - Prefer structured logging with explicit fields over dumping full error/context payloads.

`ErrorContext` is a discriminated union — narrow on `source` to access context-specific fields:

```ts
// Error from an HTTP request handler
interface HandlerErrorContext {
  source: 'handler';
  request: Request;
  url: URL;
  route: ParsedRoute | null;
  table?: IntrospectedTable;
  action?: CrudAction | 'dashboard';
  requestId?: string;
  plugin?: string; // When error originated from a plugin within a handler
}

// Error from a plugin (fire-and-forget or async)
interface PluginErrorContext {
  source: 'plugin';
  plugin: string;
  operation:
    | 'init'
    | 'transform:beforeSave'
    | 'transform:afterRead'
    | 'ui:renderField'
    | 'action'
    | 'route:render';
  action?: CrudAction;
  hookContext?: Serializable; // Full hook context at time of error
}

type ErrorContext = HandlerErrorContext | PluginErrorContext;
```

**Breaking change:** `ErrorContext` was previously a flat interface with `request`, `url`, etc. It is now a discriminated union. Update your `onError` handler to check `context.source` before accessing fields.

### Validation Schema

You can use the Zod schema directly for custom validation:

```ts
import { CmsOptionsSchema } from '@hotsauce/cms';

// Validate options before creating handler
const result = CmsOptionsSchema.safeParse(myOptions);
if (!result.success) {
  console.error(result.error.issues);
}
```

## Types

### `CmsOptions`

`CmsOptions` is a discriminated union — both `auth` and `policies` are required:

```ts
// With authentication
createCmsHandler({
  db,
  schema,
  auth: {
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
  },
  policies: { posts: ownedBy(schema.posts, 'authorId') },
});

// Without authentication (internal tool)
createCmsHandler({
  db,
  schema,
  auth: 'dangerously-open',
  policies: 'dangerously-open',
});
```

**Base options** (shared by both variants):

| Option            | Type                                                | Default      | Description                                                                            |
| ----------------- | --------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `db`              | `any`                                               | _(required)_ | Drizzle database instance                                                              |
| `schema`          | `Record<string, any>`                               | _(required)_ | Drizzle schema object (e.g., `{ users, posts }`)                                       |
| `basePath`        | `string`                                            | `'/admin'`   | Base path for CMS routes                                                               |
| `title`           | `string`                                            | `'Admin'`    | Site title for the admin UI                                                            |
| `csrfSecret`      | `string`                                            | env var      | CSRF token signing secret (32+ chars). Falls back to `CMS_CSRF_SECRET` env var         |
| `onError`         | `(error: Error, ctx: ErrorContext) => void`         | —            | Error handler for unexpected errors (see [Error Logging](#error-logging-with-onerror)) |
| `parsers`         | `Parsers`                                           | auto-gen     | Custom Zod parsers per table (overrides drizzle-zod)                                   |
| `plugins`         | `PluginConfig[]`                                    | —            | Plugins (UI overrides, transforms, action hooks)                                       |
| `storage`         | `string \| (ctx) => string \| undefined`            | —            | Storage routing: provider ID or resolver function                                      |
| `csp`             | `CspOptions`                                        | —            | Additional CSP sources (`imgSrc`, `connectSrc`, `frameSrc`, `styleSrc`)                |
| `isAuthenticated` | `(request: Request) => boolean \| Promise<boolean>` | —            | Legacy: custom auth check (prefer `auth` option)                                       |

**Auth options** (when `auth` is an object):

| Option               | Type                   | Default         | Description                                                                                              |
| -------------------- | ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `auth.provider`      | `AuthProvider`         | _(required)_    | Login provider (e.g., `PasswordProvider`)                                                                |
| `auth.secret`        | `string`               | env var         | JWT signing secret (32+ chars). Falls back to `CMS_JWT_SECRET`                                           |
| `auth.maxAge`        | `number`               | `28800` (8hr)   | Token lifetime in seconds                                                                                |
| `auth.cookieName`    | `string`               | `'cms_token'`   | Cookie name for JWT                                                                                      |
| `auth.sameSite`      | `'Lax' \| 'Strict'`    | `'Lax'`         | Cookie SameSite attribute for CSRF posture ([guidance](../../SECURITY.md#cookie-samesite--csrf-posture)) |
| `auth.loginTitle`    | `string`               | `'Admin Login'` | Title shown on login page                                                                                |
| `auth.identityLabel` | `string`               | `'Email'`       | Label for identity field on login page                                                                   |
| `auth.isRevoked`     | `(payload) => boolean` | —               | Check if a token has been revoked                                                                        |

**Policies** (required when `auth` is configured):

| Value                    | Behavior                                |
| ------------------------ | --------------------------------------- |
| `{ table: policy, ... }` | Apply row/column policies per table     |
| `{}`                     | Full access for all authenticated users |
| `'dangerously-open'`     | Bypass all policy checks                |

### `Handler`

```ts
type Handler = (request: Request) => Promise<Response> | Response;
```

### `ParsedRoute`

```ts
interface ParsedRoute {
  table: IntrospectedTable | null;
  action: CrudAction | 'dashboard';
  recordId?: string;
}
```

### `FlashMessage`

```ts
interface FlashMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
```

## Authentication & Authorization

```ts
const handler = createCmsHandler({
  db,
  schema,

  // Called for every request - return false to show 403
  isAuthenticated: async (request) => {
    const session = await getSession(request);
    return session?.user != null;
  },

  // Use policies for fine-grained access control
  policies: {
    settings: () => false, // Block access to settings
    posts: (ctx, action) => {
      if (ctx.user?.role === 'admin') return undefined; // Admin: full access
      if (action === 'delete') return false; // Non-admin: no delete
      return undefined; // Non-admin: allow other actions
    },
  },
});
```

## Authentication

The handlers package includes JWT-based authentication that can be configured directly in `createCmsHandler`.

### Quick Setup

```ts
import { createCmsHandler, PasswordProvider } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    secret: process.env.JWT_SECRET!, // Must be 32+ characters
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
  },
});

Deno.serve(handler);
```

That's it! The handler now includes `/admin/login` and `/admin/logout` routes automatically.

### PasswordProvider Defaults

`PasswordProvider` uses sensible defaults that work with common schema patterns:

| Option           | Default                  | Description                                |
| ---------------- | ------------------------ | ------------------------------------------ |
| `identityColumn` | `'email'`                | Column for login identity (email/username) |
| `passwordColumn` | `'passwordHash'`         | Column for hashed password                 |
| `idColumn`       | `'id'`                   | Column for primary key                     |
| `roleColumn`     | `'role'` (auto-detected) | Column for user role (if exists)           |

Override these only if your schema uses different column names:

```ts
new PasswordProvider({
  db,
  usersTable: schema.users,
  identityColumn: 'username', // custom identity column
  passwordColumn: 'password_hash', // custom password column
});
```

### Which Users Table?

`PasswordProvider` works with any table that has the required columns. Two common approaches:

**Dedicated admin table** (simpler):

```ts
// Separate table just for CMS admins
const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
});

new PasswordProvider({ db, usersTable: adminUsers });
```

**General-purpose users table** (shared):

```ts
// Your existing users table with a role/isAdmin column
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }), // 'admin', 'editor', 'user'
});

new PasswordProvider({ db, usersTable: users });
```

Choose based on your needs:

- **Dedicated table**: Clear separation, everyone in the table can access CMS
- **Shared table**: Single source of truth, use `policies` for role-based authorization

### Auth Options

```ts
auth: {
  // Required
  secret: 'your-32-character-minimum-secret',
  provider: authProvider,
  
  // Optional
  cookieName: 'cms_token',        // Default: 'cms_token'
  sameSite: 'Lax',                // Default: 'Lax' ('Strict' for tighter CSRF)
  maxAge: 60 * 60 * 8,            // Default: 8 hours (in seconds)
  loginTitle: 'Admin Login',      // Default: 'Admin Login'
  identityLabel: 'Email',         // Default: 'Email'
  isRevoked: async (payload) => { // Optional blocklist check
    return await isTokenBlocked(payload.sub);
  },
}
```

### Auth Exports

| Export                                                           | Purpose                             |
| ---------------------------------------------------------------- | ----------------------------------- |
| `PasswordProvider`                                               | Password + optional TOTP auth       |
| `hashPassword(password)`                                         | Hash password with PBKDF2-SHA256    |
| `verifyPassword(password, hash)`                                 | Verify password against hash        |
| `signJwt(payload, secret)`                                       | Sign a JWT token                    |
| `verifyJwt(token, secret)`                                       | Verify and decode JWT               |
| `createJwtPayload(id, role?, maxAge?)`                           | Create JWT payload with expiry      |
| `AuthProvider`                                                   | Interface for custom auth providers |
| `getTokenFromCookies(req, name)`                                 | Parse JWT from cookie header        |
| `createAuthCookie(name, token, maxAge, path, secure, sameSite?)` | Create Set-Cookie header for JWT    |
| `createClearCookie(name, path, secure, sameSite?)`               | Create Set-Cookie to clear JWT      |

### Auth Routes

When `auth` is configured, these routes are automatically added:

| URL             | Method | Description        |
| --------------- | ------ | ------------------ |
| `/admin/login`  | GET    | Login form         |
| `/admin/login`  | POST   | Submit credentials |
| `/admin/logout` | POST   | Clear auth cookie  |

### Account Routes

When using `PasswordProvider`, self-service account management routes are also added:

| URL                          | Method | Description            |
| ---------------------------- | ------ | ---------------------- |
| `/admin/account`             | GET    | Account overview page  |
| `/admin/account/password`    | GET    | Password change form   |
| `/admin/account/password`    | POST   | Submit password change |
| `/admin/account/2fa`         | GET    | 2FA management page    |
| `/admin/account/2fa/enable`  | GET    | 2FA setup form (QR)    |
| `/admin/account/2fa/enable`  | POST   | Verify & enable 2FA    |
| `/admin/account/2fa/disable` | POST   | Disable 2FA            |

These routes allow users to:

- Change their own password
- Enable 2FA by scanning a QR code with their authenticator app
- Disable 2FA (with password confirmation)

### Password Hashing

Store passwords securely using PBKDF2-SHA256:

```ts
import { hashPassword, verifyPassword } from '@hotsauce/cms';

// When creating a user
const passwordHash = await hashPassword('user-password');
await db.insert(adminUsers).values({
  email: 'admin@example.com',
  passwordHash,
});

// Verification happens automatically in PasswordProvider
```

Hash format: `$pbkdf2-sha256$iterations$base64salt$base64hash`

### Two-Factor Authentication (TOTP)

Add TOTP-based two-factor authentication by adding a `totpSecret` column to your users table and configuring `PasswordProvider`:

```ts
import { createCmsHandler, PasswordProvider } from '@hotsauce/cms';

// Schema: users table needs a totpSecret column for 2FA
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'), // null = 2FA not enabled
  role: varchar('role', { length: 50 }),
});

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    secret: process.env.JWT_SECRET!,
    provider: new PasswordProvider({
      db,
      usersTable: users,
      totpSecretColumn: 'totpSecret', // default
      issuer: 'My App', // shown in authenticator apps
      // challengeSecret reads from CMS_2FA_SECRET env var if not provided
    }),
  },
  policies: {},
});
```

**How it works:**

1. User enters email/password
2. If password valid AND user has `totpSecret` → show TOTP form with signed challenge
3. User enters 6-digit code from authenticator app
4. If TOTP valid AND challenge signature valid → login complete

Users without a `totpSecret` skip step 2-3 (2FA is optional per-user).

**Security:** The challenge token is HMAC-signed with a 5-minute expiry to prevent:

- Unlimited TOTP guessing (challenge expires, forcing password re-entry)
- User ID tampering (signature verification fails if modified)

Rate limiting should be implemented at the server level (e.g., fail2ban, middleware).

**Self-Service 2FA Setup:**

When using `PasswordProvider`, users can enable/disable 2FA themselves via the account pages at `/admin/account/2fa`. The setup flow is stateless:

1. User visits `/admin/account/2fa/enable`
2. A new TOTP secret is generated and embedded in a signed challenge token
3. QR code is displayed (requires `qrcode-generator` peer dependency)
4. User scans with authenticator app and enters the 6-digit code
5. Code is verified, secret is saved to database

No manual setup code is needed — the CMS handles everything automatically.

**Manual 2FA Setup (for custom flows):**

```ts
import { generateTOTPSecret, generateTOTPUri } from '@hotsauce/cms';

// Generate secret and QR code URI
const totpSecret = generateTOTPSecret();
const qrUri = generateTOTPUri(totpSecret, 'user@example.com', 'My App');

// Display QR code
// Pin to a version you have audited - this is a supply chain dependency
// npm install qrcode-generator@2.0.4
import qrcode from 'qrcode-generator';
const qr = qrcode(0, 'M');
qr.addData(qrUri);
qr.make();
console.log(qr.createASCII()); // Terminal output
// Or: qr.createDataURL() for <img src>
// Or: qr.createSvgTag() for inline SVG

// Save to database after user verifies a code
await db.update(users)
  .set({ totpSecret })
  .where(eq(users.id, userId));
```

**PasswordProvider Options:**

| Option             | Default          | Description                                     |
| ------------------ | ---------------- | ----------------------------------------------- |
| `db`               | (required)       | Drizzle database instance                       |
| `usersTable`       | (required)       | Drizzle table for users                         |
| `identityColumn`   | `'email'`        | Column for login identity                       |
| `passwordColumn`   | `'passwordHash'` | Column storing password hash                    |
| `roleColumn`       | `'role'`         | Column for user role                            |
| `totpSecretColumn` | `'totpSecret'`   | Column for TOTP secret (null = 2FA disabled)    |
| `issuer`           | `'CMS'`          | App name shown in authenticator                 |
| `challengeSecret`  | `CMS_2FA_SECRET` | Secret for signing challenge tokens (32+ chars) |

**TOTP Utilities:**

```ts
import {
  generateTOTP,
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
} from '@hotsauce/cms';

// Generate a random secret (32-char base32 string)
const secret = generateTOTPSecret();

// Generate current 6-digit code (for testing)
const code = await generateTOTP(secret);

// Verify a code (allows ±30 second window for clock drift)
const isValid = await verifyTOTP(userInput, secret);

// Generate URI for QR code
const uri = generateTOTPUri(secret, 'user@example.com', 'My App');
// => otpauth://totp/My%20App:user%40example.com?secret=...&issuer=My%20App&...
```

### Custom Auth Provider

Implement `AuthProvider` for custom authentication (OAuth, LDAP, etc.):

```ts
import type { AuthProvider, AuthResult } from '@hotsauce/cms';

class MyCustomProvider implements AuthProvider {
  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { token } = credentials as { token: string };
    // Your custom auth logic here
    const user = await verifyOAuthToken(token);
    if (!user) return null;
    return { status: 'authenticated', user: { id: user.id, role: user.role } };
  }
}
```

### Security Features

- **HttpOnly cookies** - Tokens not accessible via JavaScript (XSS protection)
- **SameSite=Lax** - CSRF protection for cross-site requests (default; set `auth.sameSite: 'Strict'` for the tightest posture — see [SECURITY.md → Cookie SameSite & CSRF posture](../../SECURITY.md#cookie-samesite--csrf-posture))
- **Secure flag** - Cookie only sent over HTTPS (in production)
- **PBKDF2-SHA256** - 600,000 iterations, 16-byte salt, 32-byte key
- **Constant-time comparison** - Timing attack resistance
- **Token expiration** - Default 8-hour expiry
- **POST-only logout** - Prevents CSRF logout attacks

### Authorization (Permissions)

> **Important:** The `auth` option provides **authentication only** (verifying identity). For fine-grained access control, use `policies`.

## Row-Level Security (Policies)

Policies provide atomic, race-condition-free authorization by injecting WHERE clauses directly into queries. This is the recommended approach for "users edit their own content" scenarios.

### Quick Start

```ts
import {
  adminOr,
  createCmsHandler,
  ownedBy,
  PasswordProvider,
} from '@hotsauce/cms';
import * as schema from './schema';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    secret: process.env.JWT_SECRET!,
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
  },
  policies: {
    // Users can only see/edit their own posts
    posts: ownedBy(schema.posts, 'authorId'),

    // Admins have full access, others only see their own
    comments: adminOr(ownedBy(schema.comments, 'userId')),
  },
});
```

### How Policies Work

Policies return SQL conditions that are applied to ALL queries for a table:

```ts
// Without policy:
SELECT * FROM posts WHERE id = 123

// With ownedBy(posts, 'authorId') policy:
SELECT * FROM posts WHERE id = 123 AND author_id = 'current-user-id'
```

This is **atomic** — there's no window between checking permission and executing the query where data could change (no TOCTOU race conditions).

### Policy Helpers

| Helper                                             | Description                                |
| -------------------------------------------------- | ------------------------------------------ |
| `always()`                                         | Allow all access (no filter)               |
| `never()`                                          | Deny all access (returns 403)              |
| `authenticated()`                                  | Require login (any authenticated user)     |
| `roleIs(role)`                                     | Require specific role                      |
| `roleIn(roles)`                                    | Require any of specified roles             |
| `ownedBy(table, column)`                           | Filter to records where column = user ID   |
| `ownedByOrContributor(table, owner, contributors)` | Owner OR in contributors array             |
| `adminOr(policy)`                                  | Admins bypass, others use the policy       |
| `anyOf(policies)`                                  | Allow if ANY policy allows                 |
| `allOf(policies)`                                  | Require ALL policies to allow              |
| `forActions(actionMap)`                            | Different policies per action              |
| `readOnly()`                                       | Allow list/read, deny create/update/delete |

### Action-Specific Policies

Apply different rules for different CRUD operations:

```ts
import { forActions, always, authenticated, ownedBy, roleIs } from '@hotsauce/cms';

// In createCmsHandler options:
auth: {
  // ... provider config
},
policies: {
  posts: forActions({
    list: always(),                        // Anyone can see list
    read: always(),                        // Anyone can view
    create: authenticated(),               // Must be logged in to create
    update: ownedBy(schema.posts, 'authorId'),  // Only edit own posts
    delete: roleIs('admin'),               // Only admins can delete
  }),
},
```

Use `'*'` as a fallback for actions not explicitly defined:

```ts
// In createCmsHandler options:
auth: {
  // ... provider config
},
policies: {
  // "Deny by default" - only allow what's explicitly permitted
  posts: forActions({
    list: always(),
    read: always(),
    '*': never(),  // create, update, delete → 403
  }),
  
  // "Admin-only writes" - anyone can read, admins can modify
  settings: forActions({
    list: always(),
    read: always(),
    '*': roleIs('admin'),  // create, update, delete require admin
  }),
},
```

> **Note:** Without `'*'`, undefined actions get **full access** (no policy = no filter).

### Array Column Support (Postgres)

Check if user is in a contributors array:

```ts
import { ownedByOrContributor } from '@hotsauce/cms';

// Schema: posts.contributors is text[] containing user IDs
// In createCmsHandler options:
auth: {
  // ... provider config
},
policies: {
  posts: ownedByOrContributor(schema.posts, 'authorId', 'contributors'),
},
```

Generated SQL:

```sql
WHERE author_id = 'user-123' OR contributors @> ARRAY['user-123']::text[]
```

### Custom Policies

Write custom policy functions for complex logic:

```ts
import { and, eq, or, sql } from 'drizzle-orm';
import type { PolicyFn } from '@hotsauce/cms';

const postsPolicy: PolicyFn = (ctx, action) => {
  // Admins bypass all checks
  if (ctx.user?.role === 'admin') {
    return undefined; // No filter
  }

  // Not logged in = deny
  if (!ctx.user) {
    return false; // 403 Forbidden
  }

  // Return SQL condition for filtering
  return or(
    eq(schema.posts.authorId, ctx.user.sub),
    eq(schema.posts.status, 'published'),
  );
};
```

### Policy Context

Policy functions receive context with the authenticated user:

```ts
interface PolicyContext {
  user?: {
    sub: string; // User ID from JWT
    role?: string; // User role from JWT
  };
  request: Request; // Original request (for advanced use)
  source?: string; // 'cms' | 'plugin:{name}' | undefined
}
```

`ctx.source` identifies who submitted the request:

- `'cms'` — a regular CMS form (list, create, edit, delete)
- `'plugin:puck'` — the Puck editor (or any other named plugin)
- `undefined` — no source token (no auth configured, or legacy request)

When writing a row policy that should allow both normal CMS access _and_ plugin access, use `||`:

```ts
// Correct: both regular CMS users and the Puck plugin can access
row: (ctx) => ctx.source === 'plugin:puck' || eq(posts.authorId, ctx.user!.sub),
```

Avoid a ternary that branches on `source` for row access — `ctx.source` is `undefined` for regular grid/thumbnail requests, so the else-branch would apply to all normal traffic too.

### 404 vs 403 Handling

The CMS automatically distinguishes between "record doesn't exist" (404) and "record exists but you can't access it" (403):

1. Query with policy returns no results
2. CMS queries again without policy
3. If record exists → 403 Forbidden
4. If record doesn't exist → 404 Not Found

### Rate Limiting

The login endpoint does **not** include built-in rate limiting. To protect against brute-force attacks, implement rate limiting at the infrastructure level:

- **Reverse proxy**: nginx `limit_req`, Caddy rate limiting
- **Cloud providers**: Cloudflare Rate Limiting, AWS WAF
- **Application middleware**: Add your own rate limiter before the CMS handler

```ts
// Example: wrap handler with rate limiting middleware
const handler = withRateLimiter(cmsHandler, {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  keyGenerator: (req) => req.headers.get('x-forwarded-for') ?? 'unknown',
});
```

#### Rate-limit hints

**The CMS never enforces limits; it labels routes.** With the
`rateLimitHints` option, every response is classified with a recommended
throttle strictness — level 1 (normal), 2 (elevated: list views, mutation
submits, file serving, storage presigns/uploads), or 3 (strict: login,
2FA verification, password changes) — for your infrastructure to enforce.
Levels derive from two facts a route declares: `bruteForceable` (responds
differently to guessed secrets → 3) and `resourceIntensive`
(disproportionate CPU/bandwidth/storage per request → 2).

Built-in classification:

| Level | Routes                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| 3     | login `POST` (password check and TOTP phase), `POST {basePath}/account/password`, `POST {basePath}/account/2fa/enable\|disable` |
| 2     | list views, create/update/delete submits, `{basePath}/files/...`, s3-storage presign, fs-storage presign/upload/serve           |
| 1     | everything else (dashboard, detail/edit forms, assets, login page) — absence of the header also means 1                         |

Plugin routes declare the same facts on `PluginRoute`:

```ts
routes: [{
  pattern: 'verify-code',
  methods: ['POST'],
  bruteForceable: true, // → level 3; resourceIntensive: true → level 2
  // rateLimitLevel: 2, // explicit override for routes the facts don't fit
  handler: myHandler,
}],
```

```ts
// Default false: no classification, no header — zero overhead.
createCmsHandler({ ..., rateLimitHints: 'in-process' }); // accessor only
createCmsHandler({ ..., rateLimitHints: 'header' }); // accessor + header
```

**In-process (`'in-process'`)** — read the classification from the wrapper
that directly invokes the handler (a cloned/reconstructed Response is not
found), and enforce however you like, e.g. a penalty box keyed by client IP:

```ts
import { getRouteInfo } from '@hotsauce/cms';

async function fetch(request: Request): Promise<Response> {
  if (isInPenaltyBox(clientIp(request))) {
    return new Response('Too many requests', {
      status: 429,
      headers: { 'Retry-After': '60' },
    });
  }
  const response = await cmsHandler(request);
  const level = getRouteInfo(response)?.level ?? 1; // undefined → not CMS → 1
  if (level >= 2) recordWeightedHit(clientIp(request), level);
  return response;
}
```

In-memory counters are only valid for single-isolate deployments — note that
`deno serve --parallel` already runs multiple isolates. If every constructed
handler has hints disabled, `getRouteInfo` logs a one-time warning — it
catches enforcement middleware pointed at a handler that was never given
`rateLimitHints`.

**Wire header (`'header'`)** — sets `X-Rate-Limit-Level: 1|2|3` on every
response so a proxy or CDN can enforce (HAProxy stick tables, Fastly
penalty boxes, Cloudflare response-based counting). The contract is public
API: header `X-Rate-Limit-Level`, values `"1" | "2" | "3"`, absence = 1.
Routes your app serves outside the CMS default to level 1 by construction;
set the same header on your own abuse-prone routes (form POSTs, search) and
one proxy config covers both. **Strip the header in whichever layer consumes
it** (`curl -sI https://your-site/admin/login | grep -i x-rate-limit` should
return nothing from the public internet).

##### Proxy recipes

No proxy consumes a rate-limit header natively — there is no standard header
to be compatible with. Both recipes below reference `X-Rate-Limit-Level` by
name; verify them against your proxy version before deploying.

**Fastly** (Edge Rate Limiting, a paid entitlement). The level works
directly as the counter `delta`, so one counter accumulates weighted budget;
cache hits never reach `vcl_fetch`, so only origin work is counted:

```vcl
ratecounter rc_origin {}
penaltybox pb_abuse {}

sub vcl_recv {
  if (ratelimit.penaltybox_has(pb_abuse, client.ip)) { error 429; }
}
sub vcl_fetch {
  if (std.atoi(beresp.http.X-Rate-Limit-Level) >= 2) {
    if (ratelimit.check_rate(client.ip, rc_origin,
        std.atoi(beresp.http.X-Rate-Limit-Level), 60, 30, pb_abuse, 5m)) {}
  }
}
sub vcl_deliver {
  unset resp.http.X-Rate-Limit-Level;
}
```

**HAProxy.** Stick tables replicate via the peers protocol (clustered
enforcement). `sc-inc-gpc0` increments by 1 — no weighted delta — so count
level-3 responses only, or use one counter per level:

```haproxy
backend cms
  stick-table type ip size 100k expire 10m store gpc0,gpc0_rate(60s)
  http-request  track-sc0 src
  http-request  deny deny_status 429 if { sc0_gpc0_rate gt 10 }
  http-response sc-inc-gpc0(0) if { res.hdr(X-Rate-Limit-Level) -m str 3 }
  http-response del-header X-Rate-Limit-Level
```

**Caddy** has no native consumer (no scripting runtime;
`mholt/caddy-ratelimit` is request-side only and cannot see origin response
headers) — see [DESIGN-caddy-hint-penaltybox.md](./DESIGN-caddy-hint-penaltybox.md)
for the planned module implementing the same penalty-box pattern.

### Multi-Tenancy (Shared Database)

For multi-tenant applications using a shared database with a `tenant_id` column, create a custom policy helper:

```ts
import { eq } from 'drizzle-orm';
import type { Table, Column } from 'drizzle-orm';
import type { PolicyFn } from '@hotsauce/cms';

// Filter all queries by tenant
function tenantScoped<T extends Table>(
  table: T,
  tenantColumn: keyof T & string,
): PolicyFn {
  return (ctx) => {
    // Tenant ID must be in JWT payload (see note below)
    const tenantId = (ctx.user as any)?.tenantId;
    if (!tenantId) return false;
    const col = table[tenantColumn] as Column;
    return eq(col, tenantId);
  };
}

// Usage (inside auth config)
auth: {
  // ... provider config
  policies: {
    posts: tenantScoped(schema.posts, 'tenantId'),
    comments: tenantScoped(schema.comments, 'tenantId'),
  },
}
```

**Current limitation:** The JWT payload only includes `sub` (user ID) and `role` by default. To add `tenantId`:

1. **Workaround:** Encode tenant in the subject: `createJwtPayload('tenant-123:user-456')`
2. **Custom provider:** Implement `AuthProvider` to include `tenantId` in the returned user

```ts
// Workaround: parse composite subject
function tenantScoped<T extends Table>(
  table: T,
  col: keyof T & string,
): PolicyFn {
  return (ctx) => {
    const [tenantId] = ctx.user?.sub.split(':') ?? [];
    if (!tenantId) return false;
    return eq(table[col] as Column, tenantId);
  };
}
```

> **Future:** Native `tenantId` support in `PolicyContext` is planned. This would allow `ctx.user.tenantId` directly.

## Column-Level Permissions

Beyond row-level security, you can restrict access to specific **columns** within a table. Hidden columns are automatically excluded from the UI—data never reaches the browser.

### Quick Start

```ts
const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
  },
  policies: {
    users: {
      // Row-level policy (optional, existing behavior)
      row: ownedBy(schema.users, 'id'),

      // Column-level policies (new)
      columns: {
        // Salary is hidden from non-admins entirely
        salary: {
          read: (ctx) => ctx.user?.role === 'admin',
          write: (ctx) => ctx.user?.role === 'admin',
        },
        // SSN is completely hidden (never readable or writable)
        ssn: {
          read: () => false,
          write: () => false,
        },
        // tenantId is auto-injected, never shown to users
        tenantId: {
          read: () => false,
          write: () => false,
          default: (ctx) => ctx.user?.tenantId, // Auto-inject on create
        },
      },
    },
  },
});
```

### How Column Policies Work

Each column policy has three optional properties:

| Property    | Type                              | Default | Purpose                                            |
| ----------- | --------------------------------- | ------- | -------------------------------------------------- |
| **read**    | `(ctx: PolicyContext) => boolean` | `true`  | Can user see this column?                          |
| **write**   | `(ctx: PolicyContext) => boolean` | `true`  | Can user edit this column?                         |
| **default** | `(ctx: PolicyContext) => unknown` | —       | Value to inject for non-writable columns on create |

The CMS evaluates column policies and:

1. **Filters list/detail views** — Hidden columns excluded from API responses
2. **Filters form fields** — Non-writable columns hidden from create/edit forms
3. **Injects defaults on create** — Non-writable columns get their `default` value (required for NOT NULL columns without DB default)

### Read vs Write Permissions

```ts
columns: {
  // Read-only: visible but not editable
  createdAt: {
    read: () => true,
    write: () => false,
  },

  // Write-only: can set but not see (rare)
  password: {
    read: () => false,
    write: () => true,
  },

  // Admin-only: both read and write restricted
  internalNotes: {
    read: (ctx) => ctx.user?.role === 'admin',
    write: (ctx) => ctx.user?.role === 'admin',
  },
}
```

### Hidden Required Columns

When a required column (NOT NULL without default) is hidden from users, you **must** provide a `default` in the policy. The CMS validates this **at runtime** during create operations and returns an error message if misconfigured.

```ts
// ✅ Correct: hidden required column has a default
auth: {
  policies: {
    myTable: {
      columns: {
        tenantId: {
          read: () => false,
          write: () => false,
          default: (ctx) => ctx.user?.tenantId,
        },
      },
    },
  },
}

// ❌ Error at runtime: "Column 'tenantId' is required (NOT NULL) but hidden..."
auth: {
  policies: {
    myTable: {
      columns: {
        tenantId: {
          read: () => false,
          write: () => false,
          // Missing default!
        },
      },
    },
  },
}
```

> **Note:** Columns with database defaults (e.g., `default(sql\`now()\`)`) don't need policy defaults—the database provides the value.

### Multi-Tenant Pattern

Column policies are ideal for multi-tenancy where `tenantId` should be:

- **Invisible** to users (they can't see or change it)
- **Auto-injected** on record creation
- **Filtered** by row policy (users only see their tenant's data)

```ts
import { eq, type Column, type Table } from 'drizzle-orm';
import type { PolicyFn, TablePolicy } from '@hotsauce/cms';

function multiTenant<T extends Table>(
  table: T,
  tenantColumn: keyof T & string,
): TablePolicy {
  return {
    // Row filter: only see records from your tenant
    row: ((ctx) => {
      const tenantId = (ctx.user as any)?.tenantId;
      if (!tenantId) return false;
      return eq(table[tenantColumn] as Column, tenantId);
    }) as PolicyFn,

    // Column policy: hide and auto-inject tenantId
    columns: {
      [tenantColumn]: {
        read: () => false,
        write: () => false,
        default: (ctx) => (ctx.user as any)?.tenantId,
      },
    },
  };
}

// Usage
auth: {
  // ... provider config
  policies: {
    posts: multiTenant(schema.posts, 'tenantId'),
    comments: multiTenant(schema.comments, 'tenantId'),
  },
}
```

### Combining Row and Column Policies

The `TablePolicy` type supports both:

```ts
type TablePolicy = {
  row?: Policy; // Row-level filtering (WHERE clause)
  columns?: ColumnPolicies; // Column-level permissions
};

// Or just a row policy (backward compatible)
type Policy = PolicyFn | { [action]: PolicyFn };
```

Existing row-only policies continue to work:

```ts
// These are equivalent:
auth: {
  policies: {
    posts: ownedBy(schema.posts, 'authorId'),
  },
}

auth: {
  policies: {
    posts: { row: ownedBy(schema.posts, 'authorId') },
  },
}
```

### Role-Based Column Access

Combine with role checks for fine-grained control:

```ts
const adminOnly = (ctx: PolicyContext) => ctx.user?.role === 'admin';
const managerOrAbove = (ctx: PolicyContext) =>
  ['admin', 'manager'].includes(ctx.user?.role ?? '');

auth: {
  // ... provider config
  policies: {
    employees: {
      columns: {
        salary: { read: managerOrAbove, write: adminOnly },
        ssn: { read: adminOnly, write: () => false }, // Admin read, no one writes
        performanceReview: { read: managerOrAbove, write: managerOrAbove },
      },
    },
  },
}
```

### Schema-Derived Policies (`policiesFromSchema`)

For columns that should only be writable by specific plugins, use `$cms({ plugins: {...} })` in your schema and `policiesFromSchema()` to generate column policies automatically.

**Schema definition:**

```ts
// schema.ts
import '@hotsauce/core/extend';
import { json, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  // Only the 'puck' plugin can write to this column
  content: json('content').$cms({ plugins: { puck: true } }),
  // Multiple plugins with explicit permissions
  metadata: json('metadata').$cms({
    plugins: {
      puck: { write: true },
      'block-editor': { write: true },
    },
  }),
});
```

**Server setup:**

```ts
import { createCmsHandler, ownedBy, policiesFromSchema } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  auth: {
    provider: new PasswordProvider({ db, usersTable: schema.adminUsers }),
    // policiesFromSchema reads $cms() hints and generates column write policies
    policies: policiesFromSchema(schema, {
      // Additional row policies are merged (user policies take precedence)
      pages: ownedBy(schema.pages, 'authorId'),
    }),
  },
});
```

**Generated policy:**

For `content: json().$cms({ plugins: { puck: true } })`, the generated policy is:

```ts
{
  pages: {
    columns: {
      content: {
        write: (ctx) => ctx.source === 'plugin:puck' || !ctx.source,
      },
    },
  },
}
```

- `ctx.source === 'plugin:puck'` — allows the Puck plugin to write
- `!ctx.source` — allows legacy requests without source tokens (backwards compatible)

**Why use `policiesFromSchema`?**

- **Single source of truth** — plugin permissions live with the column definition
- **Secure by default** — without explicit `plugins: { ... }`, columns are writable only via CMS core forms
- **Prevents masquerading** — plugins cannot bypass restrictions by submitting to CMS endpoints

See [Source Tokens](#source-tokens) for how the CMS identifies request origins.

> **TODO:** Consider exposing an API to share the CMS's resolved policies with application developers. This would allow them to reuse the same policy definitions in their application code (e.g., for API routes, GraphQL resolvers) instead of duplicating authorization logic.

## Plugins

Plugins extend CMS functionality with custom hooks that run during CRUD operations. Plugins are isolated in Web Workers for security, ensuring untrusted code cannot access your database or server internals.

> **See also:** [`@hotsauce/plugins`](../plugins/README.md) for official plugins and [`@hotsauce/workers`](../handlers-workers/README.md) for the Worker execution layer.

### Quick Start

```ts
import { createCmsHandler } from '@hotsauce/cms';
import type { AuditLogConfig } from '@hotsauce/plugins/audit-log';
import * as schema from './schema';

// Create Worker for plugin isolation (you control permissions)
const auditWorker = new Worker(
  import.meta.resolve('@hotsauce/plugins/audit-log/worker'),
  {
    type: 'module',
    deno: { permissions: { net: ['audit.example.com'] } }, // Deno-specific
  },
);

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    {
      name: 'audit-log',
      worker: auditWorker,
      // Filter which hooks are sent to the Worker
      filter: (ctx) =>
        ctx.hookType === 'action' &&
        ['create', 'update', 'delete'].includes(ctx.action),
      config: {
        excludeTables: ['sessions'],
        logReads: false,
      } satisfies AuditLogConfig,
    },
  ],
});
```

### Plugin Types

Plugins can define two categories of hooks:

| Category      | When             | Blocking | Purpose                               |
| ------------- | ---------------- | -------- | ------------------------------------- |
| **Transform** | During data flow | Always   | Modify data before save or after read |
| **Action**    | After operation  | Optional | Side effects (audit, webhooks, cache) |
| **UI**        | Rendering forms  | Always   | Customize field display in admin UI   |

### Transform Hooks

Transform hooks modify data as it flows through the pipeline:

```ts
const slugPlugin: Plugin = {
  name: 'auto-slug',
  hooks: {
    // Modify data before database write
    beforeSave: async (ctx, data) => {
      if (ctx.table === 'posts' && data.title && !data.slug) {
        return { ...data, slug: slugify(data.title) };
      }
      return data;
    },

    // Add computed fields after database read
    afterRead: async (ctx, data) => {
      if (data.avatarKey) {
        return { ...data, avatarUrl: getSignedUrl(data.avatarKey) };
      }
      return data;
    },
  },
};
```

### Action Hooks

Action hooks respond to CRUD operations after they complete:

```ts
const webhookPlugin: Plugin = {
  name: 'webhook',
  hooks: {
    on: {
      create: async (ctx) => {
        await fetch('https://api.example.com/webhook', {
          method: 'POST',
          body: JSON.stringify({
            action: 'create',
            table: ctx.table,
            data: ctx.newData,
          }),
        });
      },
      update: async (ctx) => {/* ... */},
      delete: async (ctx) => {/* ... */},
    },
  },
};
```

### Non-Blocking Actions

By default, action hooks block the HTTP response until they complete. For hooks that shouldn't block (logging, analytics), set `blocking: false`:

```ts
const auditPlugin: Plugin = {
  name: 'audit',
  hooks: {
    on: {
      create: {
        handler: async (ctx) => logAudit(ctx),
        blocking: false, // Fire-and-forget: don't wait for completion
      },
    },
  },
};
```

### UI Hooks

UI hooks customize how fields are rendered in the admin interface. They can run either in-process or in Workers (the return type is fully serializable).

```ts
const puckPlugin: Plugin = {
  name: 'puck',
  hooks: {
    ui: {
      // Called for each field when rendering edit forms
      renderField: (ctx) => {
        // Return null for default rendering
        if (!ctx.field.plugin) return null;

        // Parse plugin data for human-readable summary
        const data = ctx.value as { content?: unknown[] };
        const count = data?.content?.length ?? 0;

        return {
          // Link button to external editor
          link: {
            href: `/admin/puck/${ctx.table}/${ctx.recordId}/${ctx.field.name}`,
            label: 'Edit with Puck',
            target: '_blank',
          },
          // Human-readable summary instead of raw JSON
          valueSummary: count === 1 ? '1 block' : `${count} blocks`,
        };
      },
    },
  },
};
```

**FieldUIOverride return type:**

```ts
type FieldUIOverride =
  | null // Use default rendering
  | {
    link?: { label: string; href: string; target?: '_blank' };
    valueSummary?: string; // Plain text only, no HTML
  };
```

### Filter Function

Use `filter` to control which hooks are invoked. This is cleaner than stub hooks and works for both Worker and in-process plugins:

```ts
plugins: [
  {
    name: 'audit-log',
    worker: auditWorker,
    // Only forward action hooks for create/update/delete
    filter: (ctx) =>
      ctx.hookType === 'action' &&
      ['create', 'update', 'delete'].includes(ctx.action),
    config: { webhookUrl: 'https://audit.example.com' },
  },
  {
    name: 'custom-logger',
    hooks: {
      on: { create: async (ctx) => console.log('Created', ctx.recordId) },
    },
    // Skip logging for admin users or sessions table
    filter: (ctx) => ctx.user?.role !== 'admin' && ctx.table !== 'sessions',
  },
];
```

**FilterContext:**

```ts
interface FilterContext {
  hookType:
    | 'transform:beforeSave'
    | 'transform:afterRead'
    | 'action'
    | 'ui:renderField';
  table: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'list';
  user?: { sub: string; role?: string };
}
```

- Return `true` to invoke the hook, `false` to skip
- If `filter` is omitted, all hooks are invoked
- For Worker plugins: prevents unnecessary message serialization
- For in-process plugins: prevents unnecessary function calls

### Plugin Context

All hooks receive a `PluginContext` with:

```ts
interface PluginContext {
  table: string; // Table being operated on
  action: CrudAction; // 'create' | 'read' | 'update' | 'delete' | 'list'
  user?: { // Authenticated user (if available)
    sub: string; // User ID
    role?: string; // User role
  };
}

// Action hooks get additional data
interface ActionContext extends PluginContext {
  recordId?: string | number; // Primary key
  oldData?: Serializable; // Previous state (update/delete)
  newData?: Serializable; // New state (create/update)
  timestamp: string; // ISO 8601 timestamp
}
```

### Worker Isolation

Plugins can run in isolated Web Workers for security. You provide the Worker instance, giving full control over permissions:

```ts
// Create Worker with your desired permissions
const auditWorker = new Worker(
  import.meta.resolve('@hotsauce/plugins/audit-log/worker'),
  {
    type: 'module',
    // Deno: restrict permissions
    deno: { permissions: { net: ['audit.example.com'] } },
  },
);
```

> **Deno:** When using `deno.permissions` in Worker constructors, you must run with `--unstable-worker-options`:
>
> ```bash
> deno run --unstable-worker-options --permission-set=your-permission-set server.ts
> ```

```ts
// Use in plugin config
plugins: [
  {
    name: 'audit-log',
    worker: auditWorker, // Plugin runs in this Worker
    filter: (ctx) => ctx.hookType === 'action',
    config: { webhookUrl: 'https://audit.example.com' },
  },
];
```

Benefits:

- **Security**: Plugins cannot access `db`, `schema`, or server internals
- **Isolation**: A buggy plugin won't crash your server
- **Control**: You decide what each plugin can access

Worker plugins must export a `createPlugin(config)` factory:

```ts
// audit-log.worker.ts (runs in Worker)
export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  return {
    hooks: {
      on: {
        create: { handler: async (ctx) => {/* ... */}, blocking: false },
      },
    },
  };
}
```

### In-Process Plugins

For trusted first-party code, you can skip Worker isolation:

```ts
plugins: [
  {
    name: 'custom-transform',
    // No worker = runs in main thread
    hooks: {
      transform: {
        beforeSave: async (ctx, data) => ({ ...data, updatedAt: new Date() }),
      },
    },
    filter: (ctx) => ctx.table !== 'sessions',
  },
];
```

### Serializable Data Constraint

All data passed to/from plugins must be JSON-serializable:

✅ **Allowed**: strings, numbers, booleans, null, arrays, plain objects, Date\
❌ **Not allowed**: functions, class instances, symbols, circular references

This constraint enables Worker isolation without API changes.

### Column Policies and Plugin Data

**Important:** Transform hooks (`afterRead`) receive **column-filtered** records, not raw database results. If a column policy hides a field from the current user, plugins cannot access that field.

```
DB Query → Column Policy Filter → afterRead Plugin → Response
                ↑
         Hidden columns removed BEFORE plugins see data
```

This is intentional for security:

- Plugins (especially Worker-isolated ones) may be untrusted third-party code
- Column policies are enforced consistently across all data paths
- Defense in depth: even if a plugin is compromised, it can't leak hidden data

**Implications:**

- A plugin cannot compute derived fields from hidden columns
- Audit plugins see the same filtered view as the user
- If you need full record access, use `beforeSave` (which runs before filtering matters)

If you have a trusted plugin that needs full record access for `afterRead`, consider running it in-process and fetching the data directly via `db` in your handler layer instead.

### Plugin Routes

Plugins can register custom routes under their namespace (`/admin/{pluginName}/...`). This enables plugins like visual editors to provide their own UI:

```ts
plugins: [
  {
    name: 'puck',
    filter: (ctx) =>
      ctx.hookType === 'ui:renderField' || ctx.hookType === 'route',
    hooks: {
      ui: {
        renderField: (ctx) => {
          // Add "Edit with Puck" link if column has puck config
          if (ctx.field.plugin && ctx.recordId) {
            return {
              link: {
                label: 'Edit with Puck',
                href:
                  `/admin/puck/${ctx.table}/${ctx.recordId}/${ctx.field.name}`,
              },
            };
          }
          return null;
        },
      },
    },
    routes: [
      {
        // Matches: /admin/puck/:table/:id/:column
        pattern: ':table/:id/:column',
        methods: ['GET'],
        handler: (ctx) => {
          // ctx has record data, user info, CSRF token
          return `<!DOCTYPE html>
            <html>
              <body>
                <h1>Editing ${ctx.table}/${ctx.recordId}/${ctx.column}</h1>
                <pre>${JSON.stringify(ctx.value, null, 2)}</pre>
              </body>
            </html>`;
        },
      },
    ],
  },
];
```

> ℹ️ **POST routes:** Currently, plugin routes only support GET. POST support (with access to request body, FormData, etc.) is planned for a future release.

**Route Pattern Syntax:**

- `:param` - Captures a URL segment (e.g., `:table/:id`)
- Common patterns: `table`, `id`, `column` are automatically extracted
- Routes are matched in order; **first match wins**

> ⚠️ **Validate Custom Params:** URL params are decoded with `decodeURIComponent`, which means encoded slashes (`%2F`) become literal `/` in the value. The built-in params (`:table`, `:id`, `:column`) are validated against your schema, but **custom params must be validated by your handler**. Never use raw params in file paths, shell commands, or SQL without validation.

> ⚠️ **Route Ordering Matters:** Routes with static prefixes should come BEFORE generic parameter routes, otherwise the generic route will capture everything:
>
> ```ts
> // ❌ BAD: generic route swallows specific routes
> routes: [
>   { pattern: ':table/:id/:column', ... },  // Matches 'preview/posts/1' as table=preview!
>   { pattern: 'preview/:table/:id', ... },  // Never reached
> ]
>
> // ✅ GOOD: static-prefix routes first
> routes: [
>   { pattern: 'preview/:table/:id', ... },  // Checked first
>   { pattern: ':table/:id/:column', ... },  // Fallback
> ]
> ```

**PluginRouteContext:**

```ts
interface PluginRouteContext {
  table: string; // From :table param (empty if not in URL)
  recordId: string; // From :id param
  column?: string; // From :column param
  record: Record<string, Serializable>; // Full record (column-policy filtered)
  value: Serializable; // record[column] shortcut
  field?: { // Field info if column specified
    name: string;
    type: string; // CMS field type
    config: Record<string, Serializable>; // From .$cms() hints
  };
  user?: { sub: string; role?: string }; // Auth user
  csrfToken: string; // For forms
  basePath: string; // e.g., '/admin'
  requestUrl: string; // Full URL
  method: string; // 'GET' | 'POST'
  params: Record<string, string>; // All URL params
}
```

**Security:**

- Routes require authentication (same as built-in CMS routes)
- **Plugin filter is checked BEFORE fetching data** — routes respect the same `filter` function as hooks
- Filter receives `hookType: 'route'` so you can handle routes separately from hooks
- If `:table` param references a known table, row policies are checked
- POST requests validate CSRF tokens automatically
- Row and column policies are applied only when both `:table` and `:id` are present

**Authorization behavior by route shape:**

- Route includes `:table` and `:id`:
  - `filter` + row policy + column policy are applied before populating `ctx.record`/`ctx.field`.
- Route includes `:table` but no `:id`:
  - `filter` + row policy are applied.
  - Column policy filtering does not run automatically because no specific record is loaded.
- Route has no `:table` param:
  - `filter` is the primary authorization guard (plus authentication + CSRF for POST).
  - Row policies are not invoked because there is no table context.

For routes without `:table`, use a restrictive `filter` and explicit checks inside your handler for any sensitive operation.

**Important:** Plugin routes are subject to the same `filter` function as hooks. If your filter blocks a table, routes to that table will return 403 without fetching any data. This prevents data exfiltration via plugin routes:

```ts
{
  name: 'untrusted-plugin',
  filter: (ctx) => {
    // Block sensitive tables from ALL plugin access (hooks AND routes)
    if (['users', 'payments', 'api_keys'].includes(ctx.table)) return false;
    // Allow routes and action hooks, but not transform hooks
    return ctx.hookType === 'route' || ctx.hookType === 'action';
  },
  routes: [/* ... */],
}
```

**Request body size:**

For mutating (`POST`) requests, the body is capped to guard against oversized
payloads. Requests whose `Content-Length` exceeds the limit are rejected with
`413 Request body too large` before the body is read; chunked requests (no
`Content-Length`) are streamed and aborted mid-transfer once the running byte
total exceeds the limit, so an oversized body is never fully buffered.

The default cap is **200KB (204800 bytes)** — generous for the small JSON payloads
plugin routes typically handle. Override it per route with `maxBodySize` (a positive
integer number of bytes):

```ts
routes: [
  {
    pattern: 'presign',
    methods: ['POST'],
    maxBodySize: 1024, // tiny JSON body — reject anything larger
    handler: (ctx) => {
      /* ... */
    },
  },
],
```

> ℹ️ This is a defence-in-depth measure; plugin routes are already auth- and
> CSRF-gated. The streaming check enforces a hard byte cap even for chunked
> requests with no `Content-Length`.

**Worker Routes:**

Worker plugins can have routes too, but must use `render` instead of `handler`:

```ts
{
  name: 'worker-plugin',
  worker: myWorker,
  routes: [
    {
      pattern: ':table/:id',
      methods: ['GET'],
      render: 'render:editor', // Message type sent to Worker
    },
  ],
}
```

The Worker receives `{ type: 'route:render', id, payload: { renderType, context } }` and should respond with `{ id, success: true, result: { html: '...' } }`.

### Source Tokens

Source tokens identify the origin of form submissions, preventing plugins from masquerading as CMS core to bypass column write restrictions.

**Problem:** Without source identification, a malicious plugin could render a form that POSTs to CMS endpoints (e.g., `/admin/posts/1/edit`) and bypass `$cms({ plugins: {...} })` restrictions.

**Solution:** Every form submission includes a signed `__cms_source` token:

| Source          | Meaning                             |
| --------------- | ----------------------------------- |
| `cms`           | Core CMS form (create/edit screens) |
| `plugin:{name}` | Plugin form (e.g., `plugin:puck`)   |

**How it works:**

1. **CMS forms** include: `<input name="__cms_source" value="{signed: cms}" />`
2. **Plugin forms** include: `<input name="__cms_source" value="{signed: plugin:puck}" />`
3. On POST, CMS validates signature and extracts `ctx.source`
4. Column policies (from `policiesFromSchema`) check `ctx.source`

**Token format:** `{source}.{timestamp_base36}.{hmac_signature}`

- Signed with the same secret as CSRF tokens
- 4-hour expiry (same as CSRF)
- Signature prevents forgery

**Usage with `policiesFromSchema`:**

```ts
// schema.ts — column only writable by puck plugin
content: json('content').$cms({ plugins: { puck: true } })

// server.ts — generate policies from schema
auth: {
  policies: policiesFromSchema(schema),
}
```

The generated policy checks `ctx.source === 'plugin:puck'`.

**Manual source checking:**

```ts
import { isPluginSource, getPluginName } from '@hotsauce/cms';

auth: {
  policies: {
    pages: {
      columns: {
        content: {
          write: (ctx) => {
            // Only allow puck plugin or CMS core (no source = legacy)
            if (!ctx.source) return true;
            return ctx.source === 'cms' || getPluginName(ctx.source) === 'puck';
          },
        },
      },
    },
  },
}
```

**Exports:**

| Export                                | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `SOURCE`                              | Constants: `SOURCE.CMS`, `SOURCE.PLUGIN_PREFIX` |
| `SOURCE_FIELD_NAME`                   | Form field name: `'__cms_source'`               |
| `pluginSource(name)`                  | Create `'plugin:{name}'` identifier             |
| `isPluginSource(source)`              | Check if source is a plugin                     |
| `getPluginName(source)`               | Extract plugin name from source                 |
| `generateSourceToken(source, secret)` | Create signed token                             |
| `validateSourceToken(token, secret)`  | Validate and extract source                     |
| `getSourceTokenFromFormData(data)`    | Extract token from form submission              |

### Policies Without Authentication

For internal tools running without authentication (`auth: 'dangerously-open'`), you can still restrict plugin write access using source-based column policies:

```ts
// schema.ts — Define which plugins can write to which columns
content: json('content').$cms({ plugins: { puck: true } });

// server.ts — Use policies without requiring login
import { createCmsHandler, policiesFromSchema } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  auth: 'dangerously-open', // No login required
  // Restrict plugin writes even without authentication
  policies: policiesFromSchema(schema),
});
```

**Important:** User-based policies (`ownedBy`, `roleIs`, etc.) won't work without authentication since there's no `ctx.user`. They will deny all access. Only source-based column policies (checking `ctx.source`) work in this mode.

### Official Plugins

Official plugins are published in the [`@hotsauce/plugins`](../plugins/README.md) package.

#### Audit Log

Logs all CRUD operations for compliance and debugging:

```ts
import type { AuditLogConfig } from '@hotsauce/plugins/audit-log';

// Create Worker with permissions
const auditWorker = new Worker(
  import.meta.resolve('@hotsauce/plugins/audit-log/worker'),
  { type: 'module' }
);

// Plugin config
{
  name: 'audit-log',
  worker: auditWorker,
  filter: (ctx) => ctx.hookType === 'action' && !['read', 'list'].includes(ctx.action),
  config: {
    webhookUrl: 'https://api.example.com/audit', // Optional: POST logs here
    includeTables: ['posts', 'users'],           // Only log these tables
    excludeTables: ['sessions'],                 // Skip these tables
    logReads: false,                             // Don't log read operations
    logLists: false,                             // Don't log list operations
  } satisfies AuditLogConfig,
}
```

## Server Integration Examples

### Deno

```ts
Deno.serve(handler);
```

### Hono

```ts
import { Hono } from 'hono';

const app = new Hono();
app.all('/admin/*', (c) => handler(c.req.raw));
```

### Express (with adapter)

```ts
import express from 'express';

const app = express();
app.use('/admin', async (req, res) => {
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' ? req.body : undefined,
  });
  const response = await handler(request);
  res.status(response.status);
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.send(await response.text());
});
```

## Lazy Loading for Serverless & Mixed Applications

When running a combined frontend + CMS application, importing the CMS at startup can add unnecessary overhead:

- **Module parsing**: The entire CMS module tree is loaded even for frontend-only requests
- **Worker startup**: Any Worker plugins are instantiated immediately
- **Memory footprint**: CMS code stays resident even if never used

This matters most for:

- **Serverless** (Lambda, Cloudflare Workers, Vercel Edge) — cold starts affect every request
- **Mixed applications** — frontend routes don't need CMS loaded

### The Problem

```ts
// server.ts
import { createAdminHandler } from './admin/admin.ts'; // ← Loads CMS immediately

const app = new Hono();
app.route('/', siteRoutes); // Frontend routes
const cmsHandler = createAdminHandler(db); // ← Worker created at startup
app.all('/admin/*', (c) => cmsHandler(c.req.raw));
```

Even a request to `/` (homepage) pays the cost of loading the CMS module.

### The Solution: Lazy Dynamic Import

Defer CMS loading until the first admin request:

```ts
// server.ts
import { Hono } from 'hono';
import { db } from './db.ts';
import { createSiteRoutes } from './site/routes.ts';

const app = new Hono();

// Frontend routes - no CMS overhead
app.route('/', createSiteRoutes(db));

// Lazy-load CMS only when admin routes are accessed
let cmsHandler: ((req: Request) => Promise<Response>) | null = null;

app.all('/admin/*', async (c) => {
  if (!cmsHandler) {
    // First admin request: load CMS module and create handler
    const { createAdminHandler } = await import('./admin/admin.ts');
    cmsHandler = createAdminHandler(db);
  }
  return cmsHandler(c.req.raw);
});

app.all('/admin', async (c) => {
  if (!cmsHandler) {
    const { createAdminHandler } = await import('./admin/admin.ts');
    cmsHandler = createAdminHandler(db);
  }
  return cmsHandler(c.req.raw);
});
```

### Benefits

| Request Type          | Eager Loading        | Lazy Loading           |
| --------------------- | -------------------- | ---------------------- |
| `GET /` (frontend)    | CMS + Workers loaded | Nothing extra loaded   |
| First `GET /admin`    | Already loaded       | CMS + Workers load now |
| Subsequent `/admin/*` | Uses cached handler  | Uses cached handler    |

### When to Use Lazy Loading

| Environment                          | Recommendation                                |
| ------------------------------------ | --------------------------------------------- |
| Long-lived server (Deno.serve, Node) | Optional — startup cost paid once             |
| Serverless (Lambda, Workers)         | **Recommended** — reduces cold start latency  |
| Mixed frontend + admin app           | **Recommended** — frontend requests stay fast |
| Admin-only application               | Not needed — every request needs CMS anyway   |

### Note on Workers

Worker plugins (like audit-log) are created inside your `createAdminHandler` function. With lazy loading, they're only instantiated when the CMS module loads — i.e., on the first admin request. No additional `createWorker` factory pattern is needed.
