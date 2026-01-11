# @drizzle-cms/handlers

CRUD route handlers for the CMS admin interface using Web Standard Request/Response.

## Installation

```ts
import { createCmsHandler } from '@drizzle-cms/handlers';
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   @drizzle-cms/handlers                     │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│   mod.ts    │  router.ts  │   crud.ts   │   utils.ts        │
│             │             │             │                   │
│  Main       │  URL        │  CRUD       │  Response         │
│  handler    │  parsing    │  operations │  helpers          │
│  factory    │  + dispatch │             │                   │
└─────────────┴─────────────┴─────────────┴───────────────────┘
        ↓             ↓             ↓             ↓
   Entry point    Route        List/Create/   HTML, JSON,
   for servers    matching     Read/Update/   redirects
                               Delete
```

## Design Principles

- **Web Standard APIs**: Uses `Request` and `Response` (no framework lock-in)
- **BYOS (Bring Your Own Server)**: Works with Deno, Node 18+, Bun, Workers
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
});

// Deno
Deno.serve(handler);

// Node 18+ (with adapter)
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
| `CrudAction` | `'list' \| 'read' \| 'create' \| 'update' \| 'delete'` |

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

### `utils.ts` - Response Helpers

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
  /** Custom authentication check */
  isAuthenticated?: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table/action */
  canAccess?: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
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
