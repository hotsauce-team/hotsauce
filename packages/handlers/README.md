# @drizzle-cms/handlers

CRUD route handlers for the CMS admin interface using Web Standard Request/Response.

## Installation

```ts
import { createCmsHandler } from '@drizzle-cms/handlers';
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              @drizzle-cms/handlers                                   │
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
import { createCmsHandler } from '@drizzle-cms/handlers';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  title: 'My CMS',
  // Optional: custom validation (see Form Validation section)
  // parsers: { users: { insert: (d) => usersSchema.parse(d) } },
});

// Deno
Deno.serve(handler);

// Node 20+ (with adapter)
// Hono: app.all('/admin/*', (c) => handler(c.req.raw));
// Express: app.use('/admin', expressAdapter(handler));
```

## Modules

### `mod.ts` - Main Entry Point

| Export | Purpose |
|--------|---------|
| `createCmsHandler(options)` | Create the main CMS handler |
| `CmsOptions` | Configuration options type |
| `Handler` | `(Request) => Response` type |
| `CrudAction` | `'list' \| 'read' \| 'create' \| 'update' \| 'delete'` || `generateCsrfToken()` | Generate signed CSRF token |
| `validateCsrfToken(token)` | Validate CSRF token (signature + expiry) |
**Example:**

```ts
import { createCmsHandler } from '@drizzle-cms/handlers';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  title: 'Blog Admin',
  isAuthenticated: (req) => req.headers.get('X-User') !== null,
  canAccess: (req, table, action) => {
    // Custom authorization logic
    return table.name !== 'settings' || action === 'read';
  },
});
```

### `router.ts` - URL Routing

| Export | Purpose |
|--------|---------|
| `parseRoute(url, basePath, tables)` | Parse URL to route info |
| `resolveAction(route, method)` | Determine CRUD action from HTTP method |
| `cmsUrl(basePath, table?, action?, id?)` | Generate CMS URLs |
| `formatTableName(name)` | `posts_to_categories` → `Posts To Categories` |
| `formatColumnName(name)` | `author_id` → `Author Id` |

**URL Patterns:**

| URL | Method | Action |
|-----|--------|--------|
| `/admin` | GET | Dashboard |
| `/admin/posts` | GET | List posts |
| `/admin/posts/new` | GET | Create form |
| `/admin/posts/new` | POST | Create record |
| `/admin/posts/123` | GET | View post |
| `/admin/posts/123/edit` | GET | Edit form |
| `/admin/posts/123/edit` | POST | Update record |
| `/admin/posts/123/delete` | POST | Delete record |

**Example:**

```ts
import { cmsUrl } from '@drizzle-cms/handlers';

cmsUrl('/admin');                        // '/admin'
cmsUrl('/admin', 'posts');               // '/admin/posts'
cmsUrl('/admin', 'posts', 'read', '123'); // '/admin/posts/123'
cmsUrl('/admin', 'posts', 'edit', '123'); // '/admin/posts/123/edit'
cmsUrl('/admin', 'posts', 'new');        // '/admin/posts/new'
```

### `crud.ts` - CRUD Handlers

Internal handlers for each CRUD operation. These are called by the main handler.

| Handler | Action | Description |
|---------|--------|-------------|
| `handleDashboard` | GET `/admin` | Shows table list |
| `handleList` | GET `/admin/:table` | Paginated table view |
| `handleRead` | GET `/admin/:table/:id` | Single record view |
| `handleCreate` | GET/POST `/admin/:table/new` | Create form/submit |
| `handleUpdate` | POST `/admin/:table/:id/edit` | Update record |
| `handleDelete` | POST `/admin/:table/:id/delete` | Delete record |

### `http.ts` - HTTP Response Helpers

| Export | Purpose |
|--------|---------|
| `htmlResponse(html, status?)` | Create HTML response |
| `jsonResponse(data, status?)` | Create JSON response |
| `redirect(url, status?)` | Create redirect response |
| `redirectWithFlash(url, flash)` | Redirect with flash message |
| `parseFlashFromUrl(url)` | Extract flash from URL params |
| `notFound(message?)` | 404 response |
| `forbidden(message?)` | 403 response |
| `methodNotAllowed(allowed)` | 405 response |
| `parseFormData(request)` | Parse form submission |
| `coerceFormValues(data, columns)` | Convert form strings to types |
| `getPagination(url)` | Extract page/limit from URL |
| `getSort(url, columns)` | Extract sort column/direction |

**Example:**

```ts
import { htmlResponse, redirect, parseFormData, coerceFormValues } from '@drizzle-cms/handlers';

// Create responses
htmlResponse('<h1>Hello</h1>');           // 200 HTML
htmlResponse('<h1>Error</h1>', 400);      // 400 HTML
redirect('/admin/posts');                  // 302 redirect

// Parse form data
const formData = await parseFormData(request);
const values = coerceFormValues(formData, table.columns);
// { title: 'Hello', published: true, authorId: 1 }
```

### `csrf.ts` - CSRF Protection

| Export | Purpose |
|--------|---------|  
| `generateCsrfToken(secret)` | Generate HMAC-SHA256 signed token (4-hour expiry) |
| `validateCsrfToken(token, secret)` | Validate signature and check expiry |
| `getCsrfTokenFromFormData(data)` | Extract `_csrf` field from form |
| `generateCsrfSecret()` | Generate a secure random secret (32 bytes) |

**Token Format:** `timestamp.random.signature`

Tokens are signed with HMAC-SHA256 using `crypto.subtle` (Web Crypto API). They are automatically validated on all POST operations (create, update, delete). Invalid or expired tokens show an error message and block the operation.

**Example:**

```ts
import { generateCsrfToken, validateCsrfToken, generateCsrfSecret } from '@drizzle-cms/handlers';

// Generate a secret once at startup (or load from env)
const secret = Deno.env.get('CSRF_SECRET') ?? generateCsrfSecret();

// Generate token for forms (async)
const token = await generateCsrfToken(secret);
// → "lq2abc.0123456789abcdef...signature"

// Validate on submit (async)
const isValid = await validateCsrfToken(token, secret);
// → true (if signature matches and not expired)
```

### `crud-helpers.ts` - CRUD Helpers

Utilities for CRUD operations. Some are exported from mod.ts for custom validation.

| Function | Exported | Purpose |
|----------|----------|---------|  
| `validateFormData()` | ✅ | Validate form data with drizzle-zod |
| `validateWithParsers()` | ✅ | Validate with custom parser support |
| `formatZodErrors()` | ✅ | Convert ZodError to field errors |
| `buildNavItems()` | ❌ | Build sidebar navigation |
| `findRecord()` | ❌ | Fetch single record by ID |
| `getSafeErrorMessage()` | ❌ | Sanitize error messages for users |
| `isForeignKeyViolation()` | ❌ | Detect FK constraint errors |

### `styles.ts` - External Stylesheet

CSS served as an external file for strict CSP compliance.

| Export | Purpose |
|--------|---------|
| `cmsStylesheet` | Raw CSS string for custom serving |
| `handleStylesheet()` | Route handler returning CSS response |
| `cssResponse(css)` | Create a CSS response with caching headers |

The stylesheet is automatically served at `{basePath}/styles.css`. This enables strict Content Security Policy (`style-src 'self'`) without requiring nonces.

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

### CSRF Protection

Forms include CSRF tokens validated on POST. See `csrf.ts` exports.

### Form Validation

By default, form data is validated using auto-generated Zod schemas from `drizzle-zod`. For custom validation (e.g., email format, min/max length), provide custom parsers:

```ts
import { createCmsHandler, type Parsers } from '@drizzle-cms/handlers';
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
  insert?: ParserFn;  // For create operations
  update?: ParserFn;  // For update operations
}

// All custom parsers keyed by table name
type Parsers = Record<string, TableParsers>;

// Validation result returned by validateFormData()
interface ValidationResult {
  success: boolean;
  data?: Record<string, unknown>;   // Validated data (on success)
  errors?: Record<string, string>;  // Field-level errors
  formError?: string;               // Form-level error message
}
```

**Exported Validation Utilities:**

| Export | Purpose |
|--------|---------|  
| `validateFormData(table, values, mode)` | Validate using drizzle-zod schema |
| `validateWithParsers(opts, name, table, values, mode)` | Validate with custom parser fallback |
| `formatZodErrors(zodError)` | Convert ZodError to field-keyed errors |

## Error Handling

The library distinguishes between **configuration errors** (programming mistakes) and **runtime errors** (expected failures).

### Configuration Errors (Throws)

Invalid configuration throws `CmsConfigError` at startup:

```ts
import { createCmsHandler, CmsConfigError } from '@drizzle-cms/handlers';

try {
  const handler = createCmsHandler({
    db: null,  // ❌ Invalid - throws immediately
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

| Condition | Behavior |
|-----------|----------|
| `db` is null/undefined | Throws `CmsConfigError` |
| `schema` is empty | Throws `CmsConfigError` |
| `basePath` doesn't start with `/` | Throws `CmsConfigError` |
| `csrfSecret` less than 32 chars | Throws `CmsConfigError` |
| Schema introspection fails | Throws (table not found, etc.) |

### Runtime Errors (HTTP Responses)

Expected failures return appropriate HTTP responses:

| Condition | Response |
|-----------|----------|
| Route not found | 404 Not Found |
| Authentication fails | 403 Forbidden |
| Authorization denied | 403 Forbidden |
| Record not found | 404 Not Found |
| Validation errors | 400 with form errors |
| CSRF token invalid | 403 with error message |
| Foreign key violation on delete | Error flash message |
| Unexpected database error | 500 Internal Server Error |

### Error Logging with `onError`

Unexpected errors (database failures, etc.) return a generic 500 to users. Use `onError` to log details to your monitoring service:

```ts
import { createCmsHandler, ErrorContext } from '@drizzle-cms/handlers';

const handler = createCmsHandler({
  db,
  schema,
  
  onError: (error: Error, context: ErrorContext) => {
    // Log to your monitoring service
    logger.error('CMS error', {
      message: error.message,
      stack: error.stack,
      path: context.url.pathname,
      table: context.table?.name,
      action: context.action,
    });
    
    // Or send to Sentry, Datadog, etc.
    Sentry.captureException(error, {
      extra: {
        table: context.table?.name,
        action: context.action,
      },
    });
  },
});
```

The `ErrorContext` includes:

```ts
interface ErrorContext {
  request: Request;       // Original request
  url: URL;               // Parsed URL
  route: ParsedRoute | null;  // Route info (if parsed)
  table?: IntrospectedTable;  // Table being accessed
  action?: CrudAction | 'dashboard';  // Action attempted
}
```

### Validation Schema

You can use the Zod schema directly for custom validation:

```ts
import { CmsOptionsSchema } from '@drizzle-cms/handlers';

// Validate options before creating handler
const result = CmsOptionsSchema.safeParse(myOptions);
if (!result.success) {
  console.error(result.error.issues);
}
```

## Types

### `CmsOptions`

```ts
interface CmsOptions {
  /** Drizzle database instance */
  db: any;
  /** Drizzle schema object (e.g., { users, posts }) */
  schema: Record<string, any>;
  /** Base path for CMS routes (default: '/admin') */
  basePath?: string;
  /** Site title for the admin UI */
  title?: string;
  /** 
   * Secret for CSRF token signing (HMAC-SHA256).
   * Must be at least 32 characters. Use generateCsrfSecret() to create one.
   * If not provided, a random secret is generated (tokens won't survive restarts).
   */
  csrfSecret?: string;
  /** Custom authentication check */
  isAuthenticated?: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table/action */
  canAccess?: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
  /** Custom parsers for form validation (optional) */
  parsers?: Parsers;
}
```

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
  
  // Called for table operations - return false to deny
  canAccess: async (request, table, action) => {
    const session = await getSession(request);
    
    // Admin can do anything
    if (session?.user?.role === 'admin') return true;
    
    // Editors can't delete
    if (action === 'delete') return false;
    
    // Nobody touches settings except admins
    if (table.name === 'settings') return false;
    
    return true;
  },
});
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
