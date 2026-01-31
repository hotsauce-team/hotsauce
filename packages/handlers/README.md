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

### `runtime-compat.ts` - Cross-Runtime Utilities

| Export                         | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `getEnv(key)`                  | Get env var (works in Deno, Node, Bun, Workers)  |
| `requireEnv(key, description)` | Get required env var or throw with helpful error |

**Example:**

```ts
import { getEnv, requireEnv } from '@drizzle-cms/handlers';

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
import { cmsUrl } from '@drizzle-cms/handlers';

cmsUrl('/admin'); // '/admin'
cmsUrl('/admin', 'posts'); // '/admin/posts'
cmsUrl('/admin', 'posts', 'read', '123'); // '/admin/posts/123'
cmsUrl('/admin', 'posts', 'edit', '123'); // '/admin/posts/123/edit'
cmsUrl('/admin', 'posts', 'new'); // '/admin/posts/new'
```

### `crud.ts` - CRUD Handlers

Internal handlers for each CRUD operation. These are called by the main handler.

| Handler           | Action                          | Description          |
| ----------------- | ------------------------------- | -------------------- |
| `handleDashboard` | GET `/admin`                    | Shows table list     |
| `handleList`      | GET `/admin/:table`             | Paginated table view |
| `handleRead`      | GET `/admin/:table/:id`         | Single record view   |
| `handleCreate`    | GET/POST `/admin/:table/new`    | Create form/submit   |
| `handleUpdate`    | POST `/admin/:table/:id/edit`   | Update record        |
| `handleDelete`    | POST `/admin/:table/:id/delete` | Delete record        |

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

**Example:**

```ts
import {
  coerceFormValues,
  htmlResponse,
  parseFormData,
  redirect,
} from '@drizzle-cms/handlers';

// Create responses
htmlResponse('<h1>Hello</h1>'); // 200 HTML
htmlResponse('<h1>Error</h1>', 400); // 400 HTML
redirect('/admin/posts'); // 302 redirect

// Parse form data
const formData = await parseFormData(request);
const values = coerceFormValues(formData, table.columns);
// { title: 'Hello', published: true, authorId: 1 }
```

### File uploads (MVP)

File uploads are supported by storing a JSON `FileReference` object in a column that is marked as a file field via `$cms({ file: true })`.

- Storage: uploaded bytes are converted to base64 and stored in the JSON field (as `data`).
- Validation: controlled per-column via `$cms({ accept, maxSize })` (with sensible defaults).
- Forms: the admin automatically switches to `multipart/form-data` when a table has file columns.
- Clearing: file inputs can be cleared on update via a `_clear_<propertyName>` field.

**Schema example (Postgres):**

```ts
import '@drizzle-cms/core/extend';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import type { FileReference } from '@drizzle-cms/core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  avatar: jsonb('avatar')
    .$type<FileReference>()
    .$cms({ file: true, accept: 'image/*', maxSize: 200_000 }),
});
```

**File serving route:**

The handler exposes a read-only route that serves file fields:

- `GET {basePath}/files/{table}/{column}/{id}`

Access is still filtered through auth + row/column policies.

Notes:

- If the stored `FileReference` includes a `url`, the handler redirects (only to safe URL protocols).
- If the stored `FileReference` includes `data` (base64), the handler serves the bytes with security headers (including `X-Content-Type-Options: nosniff`).

### `csrf.ts` - CSRF Protection

| Export                             | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `generateCsrfToken(secret)`        | Generate HMAC-SHA256 signed token (4-hour expiry) |
| `validateCsrfToken(token, secret)` | Validate signature and check expiry               |
| `getCsrfTokenFromFormData(data)`   | Extract `_csrf` field from form                   |

**Token Format:** `timestamp.random.signature`

Tokens are signed with HMAC-SHA256 using `crypto.subtle` (Web Crypto API). They are automatically validated on all POST operations (create, update, delete). Invalid or expired tokens show an error message and block the operation.

**Example:**

```ts
import { generateCsrfToken, validateCsrfToken } from '@drizzle-cms/handlers';

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
import { CmsConfigError, createCmsHandler } from '@drizzle-cms/handlers';

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
  request: Request; // Original request
  url: URL; // Parsed URL
  route: ParsedRoute | null; // Route info (if parsed)
  table?: IntrospectedTable; // Table being accessed
  action?: CrudAction | 'dashboard'; // Action attempted
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
   * Must be at least 32 characters. Generate with: openssl rand -base64 32
   * If not provided, a random secret is generated (tokens won't survive restarts).
   */
  csrfSecret?: string;
  /** Custom authentication check */
  isAuthenticated?: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table/action */
  canAccess?: (
    request: Request,
    table: IntrospectedTable,
    action: CrudAction,
  ) => Promise<boolean> | boolean;
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

## Authentication

The handlers package includes JWT-based authentication that can be configured directly in `createCmsHandler`.

### Quick Setup

```ts
import { createCmsHandler, PasswordProvider } from '@drizzle-cms/handlers';

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
- **Shared table**: Single source of truth, use `canAccess` for role-based authorization

### Auth Options

```ts
auth: {
  // Required
  secret: 'your-32-character-minimum-secret',
  provider: authProvider,
  
  // Optional
  cookieName: 'cms_token',        // Default: 'cms_token'
  maxAge: 60 * 60 * 8,            // Default: 8 hours (in seconds)
  loginTitle: 'Admin Login',      // Default: 'Admin Login'
  identityLabel: 'Email',         // Default: 'Email'
  isRevoked: async (payload) => { // Optional blocklist check
    return await isTokenBlocked(payload.sub);
  },
}
```

### Auth Exports

| Export                                 | Purpose                             |
| -------------------------------------- | ----------------------------------- |
| `PasswordProvider`                     | Password + optional TOTP auth       |
| `hashPassword(password)`               | Hash password with PBKDF2-SHA256    |
| `verifyPassword(password, hash)`       | Verify password against hash        |
| `signJwt(payload, secret)`             | Sign a JWT token                    |
| `verifyJwt(token, secret)`             | Verify and decode JWT               |
| `createJwtPayload(id, role?, maxAge?)` | Create JWT payload with expiry      |
| `AuthProvider`                         | Interface for custom auth providers |
| `getTokenFromCookies(req, name)`       | Parse JWT from cookie header        |
| `createAuthCookie(...)`                | Create Set-Cookie header for JWT    |
| `createClearCookie(name, path)`        | Create Set-Cookie to clear JWT      |

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
import { hashPassword, verifyPassword } from '@drizzle-cms/handlers';

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
import { createCmsHandler, PasswordProvider } from '@drizzle-cms/handlers';

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
3. QR code is displayed (using `@drizzle-cms/vendor` qrcode library)
4. User scans with authenticator app and enters the 6-digit code
5. Code is verified, secret is saved to database

No manual setup code is needed — the CMS handles everything automatically.

**Manual 2FA Setup (for custom flows):**

```ts
import { generateTOTPSecret, generateTOTPUri } from '@drizzle-cms/handlers';

// Generate secret and QR code URI
const totpSecret = generateTOTPSecret();
const qrUri = generateTOTPUri(totpSecret, 'user@example.com', 'My App');

// Display QR code (use any QR library, or the vendored one)
import { qrcode } from '@drizzle-cms/vendor';
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
} from '@drizzle-cms/handlers';

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
import type { AuthProvider, AuthResult } from '@drizzle-cms/handlers';

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
- **SameSite=Lax** - CSRF protection for cross-site requests
- **Secure flag** - Cookie only sent over HTTPS (in production)
- **PBKDF2-SHA256** - 600,000 iterations, 16-byte salt, 32-byte key
- **Constant-time comparison** - Timing attack resistance
- **Token expiration** - Default 8-hour expiry
- **POST-only logout** - Prevents CSRF logout attacks

### Authorization (Permissions)

> **Important:** The `auth` option provides **authentication only** (verifying identity). For fine-grained access control, use **policies** (recommended) or the `canAccess` callback.

## Row-Level Security (Policies)

Policies provide atomic, race-condition-free authorization by injecting WHERE clauses directly into queries. This is the recommended approach for "users edit their own content" scenarios.

### Quick Start

```ts
import {
  adminOr,
  createCmsHandler,
  ownedBy,
  PasswordProvider,
} from '@drizzle-cms/handlers';
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
import { forActions, always, authenticated, ownedBy, roleIs } from '@drizzle-cms/handlers';

policies: {
  posts: forActions({
    list: always(),                        // Anyone can see list
    read: always(),                        // Anyone can view
    create: authenticated(),               // Must be logged in to create
    update: ownedBy(schema.posts, 'authorId'),  // Only edit own posts
    delete: roleIs('admin'),               // Only admins can delete
  }),
}
```

Use `'*'` as a fallback for actions not explicitly defined:

```ts
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
}
```

> **Note:** Without `'*'`, undefined actions get **full access** (no policy = no filter).

### Array Column Support (Postgres)

Check if user is in a contributors array:

```ts
import { ownedByOrContributor } from '@drizzle-cms/handlers';

// Schema: posts.contributors is text[] containing user IDs
policies: {
  posts: ownedByOrContributor(schema.posts, 'authorId', 'contributors'),
}
```

Generated SQL:

```sql
WHERE author_id = 'user-123' OR contributors @> ARRAY['user-123']::text[]
```

### Custom Policies

Write custom policy functions for complex logic:

```ts
import { and, eq, or, sql } from 'drizzle-orm';
import type { PolicyFn } from '@drizzle-cms/handlers';

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
}
```

### 404 vs 403 Handling

The CMS automatically distinguishes between "record doesn't exist" (404) and "record exists but you can't access it" (403):

1. Query with policy returns no results
2. CMS queries again without policy
3. If record exists → 403 Forbidden
4. If record doesn't exist → 404 Not Found

### Combining with `canAccess`

Policies and `canAccess` can be used together:

- `canAccess` runs first (table-level permission check)
- Policies run second (row-level filtering)

```ts
const handler = createCmsHandler({
  db,
  schema,

  // Table-level: block entire tables
  canAccess: (req, table, action) => {
    if (table.name === 'secrets') return false;
    return true;
  },

  // Row-level: filter within allowed tables
  policies: {
    posts: ownedBy(schema.posts, 'authorId'),
  },
});
```

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

### Multi-Tenancy (Shared Database)

For multi-tenant applications using a shared database with a `tenant_id` column, create a custom policy helper:

```ts
import { eq } from 'drizzle-orm';
import type { Table, Column } from 'drizzle-orm';
import type { PolicyFn } from '@drizzle-cms/handlers';

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

// Usage
policies: {
  posts: tenantScoped(schema.posts, 'tenantId'),
  comments: tenantScoped(schema.comments, 'tenantId'),
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
  auth: { jwtSecret },
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
columns: {
  tenantId: {
    read: () => false,
    write: () => false,
    default: (ctx) => ctx.user?.tenantId,
  },
}

// ❌ Error at runtime: "Column 'tenantId' is required (NOT NULL) but hidden..."
columns: {
  tenantId: {
    read: () => false,
    write: () => false,
    // Missing default!
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
import type { PolicyFn, TablePolicy } from '@drizzle-cms/handlers';

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
policies: {
  posts: multiTenant(schema.posts, 'tenantId'),
  comments: multiTenant(schema.comments, 'tenantId'),
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
policies: {
  posts: ownedBy(schema.posts, 'authorId'),
}

policies: {
  posts: { row: ownedBy(schema.posts, 'authorId') },
}
```

### Role-Based Column Access

Combine with role checks for fine-grained control:

```ts
const adminOnly = (ctx: PolicyContext) => ctx.user?.role === 'admin';
const managerOrAbove = (ctx: PolicyContext) =>
  ['admin', 'manager'].includes(ctx.user?.role ?? '');

policies: {
  employees: {
    columns: {
      salary: { read: managerOrAbove, write: adminOnly },
      ssn: { read: adminOnly, write: () => false }, // Admin read, no one writes
      performanceReview: { read: managerOrAbove, write: managerOrAbove },
    },
  },
}
```

## Plugins

Plugins extend CMS functionality with custom hooks that run during CRUD operations. Plugins are isolated in Web Workers for security, ensuring untrusted code cannot access your database or server internals.

> **See also:** [`@drizzle-cms/plugins`](../plugins/README.md) for official plugins and [`@drizzle-cms/handlers-workers`](../handlers-workers/README.md) for the Worker execution layer.

### Quick Start

```ts
import { createCmsHandler } from '@drizzle-cms/handlers';
import type { AuditLogConfig } from '@drizzle-cms/plugins/audit-log';
import * as schema from './schema';

// Create Worker for plugin isolation (you control permissions)
const auditWorker = new Worker(
  import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
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
  hookType: 'transform:beforeSave' | 'transform:afterRead' | 'action';
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
  import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
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

### Official Plugins

Official plugins are published in the [`@drizzle-cms/plugins`](../plugins/README.md) package.

#### Audit Log

Logs all CRUD operations for compliance and debugging:

```ts
import type { AuditLogConfig } from '@drizzle-cms/plugins/audit-log';

// Create Worker with permissions
const auditWorker = new Worker(
  import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
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
