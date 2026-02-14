# Demo App

A complete blog site with a server-rendered public frontend (Hono) and a headless CMS admin interface (hotsauce-cms) sharing the same database.

## Features

- **Public Blog** - Server-rendered pages using Hono and template literals
- **CMS Admin** - Full admin interface powered by hotsauce-cms
- **Shared Database** - Both frontend and admin use the same Drizzle schema
- **Minimal Dependencies** - Hono via JSR + a small markdown parser for the example plugin

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Single Deno Server                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────┐         ┌─────────────────────────┐  │
│   │  Public Routes  │         │    Admin Routes         │  │
│   │    (Hono)       │         │    (hotsauce-cms)        │  │
│   │                 │         │                         │  │
│   │  GET /          │         │  /admin/* → cmsHandler  │  │
│   │  GET /post/:id  │         │  /admin/login           │  │
│   │  GET /page/:id  │         │  /admin/posts           │  │
│   │  GET /category  │         │  /admin/pages           │  │
│   │  GET /author    │         │  ...                    │  │
│   └────────┬────────┘         └────────────┬────────────┘  │
│            │                               │               │
│            └───────────┬───────────────────┘               │
│                        ▼                                   │
│              ┌─────────────────┐                           │
│              │  Drizzle ORM    │                           │
│              │  (shared schema)│                           │
│              └────────┬────────┘                           │
│                       │                                    │
└───────────────────────┼────────────────────────────────────┘
                        ▼
               ┌─────────────────┐
               │    PostgreSQL   │
               │    (PGlite)     │
               └─────────────────┘
```

## Serverless Optimization

The CMS admin handler is lazy-loaded using dynamic `import()` — it's only loaded on the first `/admin/*` request. Public site requests skip the CMS import entirely, keeping cold starts fast.

## Quick Start

1. **Seed the database:**

```bash
deno task seed
```

2. **Run the server:**

```bash
deno task dev
```

> **Note:** The dev task uses `--unstable-worker-options` to enable Worker permissions for the markdown plugin. This flag is required when using `deno.permissions` in Worker constructors.

3. **Open the site:**

- **Blog:** http://localhost:3000
- **CMS Admin:** http://localhost:3000/admin

## Admin Credentials

- **Email:** `admin@example.com`
- **Password:** `admin123`

## Project Structure

```
apps/demo/
│
├── server.ts       # Entry point - wires site + admin together
├── security.ts     # CSP and security headers
├── db.ts           # Database connection (shared)
├── schema.ts       # Drizzle schema (shared)
├── seed.ts         # Database seeding script
├── components.tsx  # Puck visual editor components (React)
├── deno.jsonc      # Deno configuration
│
├── admin/          # CMS admin (admin only)
│   ├── admin.ts    # CMS handler configuration
│   ├── components.js # Built Puck components bundle
│   └── markdown-worker.ts # Worker plugin for markdown
│
├── lib/            # Shared code (used by admin + site)
│   ├── markdown.ts # Markdown parser wrapper (micromark)
│   ├── sanitize.ts # Allowlist HTML sanitizer (XSS prevention)
│   └── sanitize_test.ts # Sanitizer test suite
│
├── site/           # Public frontend (site only)
│   ├── routes.ts   # Hono routes for public pages
│   ├── templates.ts # HTML templates
│   ├── puck-render.tsx # Server-side Puck content renderer
│   └── static/     # Static assets
│       ├── styles.css      # Site styles
│       └── components.css  # Puck component styles (BEM)
│
└── data/           # PGlite database (created on first run)
```

### File Responsibilities

| File                         | Used By    | Purpose                             |
| ---------------------------- | ---------- | ----------------------------------- |
| `server.ts`                  | Both       | Entry point, combines site + admin  |
| `security.ts`                | Server     | CSP middleware                      |
| `db.ts`                      | Both       | Database connection                 |
| `schema.ts`                  | Both       | Drizzle tables & relations          |
| `components.tsx`             | Both       | Puck component definitions (React)  |
| `admin/admin.ts`             | Admin only | CMS handler configuration           |
| `admin/components.js`        | Admin only | Built Puck components bundle        |
| `admin/markdown-worker.ts`   | Admin only | Markdown Worker plugin              |
| `lib/markdown.ts`            | Both       | Markdown parser wrapper (micromark) |
| `lib/sanitize.ts`            | Both       | Allowlist HTML sanitizer            |
| `site/routes.ts`             | Site only  | Public page routes                  |
| `site/templates.ts`          | Site only  | HTML rendering                      |
| `site/puck-render.tsx`       | Site only  | Server-side Puck content renderer   |
| `site/static/styles.css`     | Site only  | Site stylesheet                     |
| `site/static/components.css` | Site only  | Puck component styles (BEM)         |
| `seed.ts`                    | Setup      | Initial data population             |

## Security

The site uses a strict Content Security Policy (CSP) that:

- **No inline scripts** (`script-src 'none'`) — Pure server-rendered HTML
- **No inline styles** — All CSS served from `/static/*.css` (BEM classes instead of inline `style` attributes)
- **Same-origin forms** — Form submissions restricted to same origin
- **No iframes** — Cannot be embedded in other sites

The CSP middleware in [security.ts](security.ts) applies to all public site routes but **skips `/admin/*`** to avoid overriding hotsauce-cms response headers.

### Puck Components & CSP

Puck components use **BEM CSS classes** instead of React inline styles to comply with strict CSP:

```tsx
// components.tsx - uses className, not style={{}}
render: (({ align }) => (
  <h1 className={`heading heading--align-${align}`}>...</h1>
));
```

Styles are defined in `site/static/components.css` and served as an external stylesheet.

This example also includes a **public** media route (`GET /files/media/:id`) for rendering images/files on the public site.
It’s separate from hotsauce-cms’s protected file route (`GET {basePath}/files/{table}/{column}/{id}`), which enforces auth + row/column policies.

## Plugin Column Roles

Plugins use schema metadata to discover which columns they should operate on. The `$cms()` method marks columns with plugin configuration:

```ts
// schema.ts

// Puck visual editor - role defaults to 'data'
content: jsonb('content').$cms({ plugins: { puck: true } }),

// Markdown transform - source + output columns
content: text('content').$cms({
  plugins: { markdown: { role: 'source', output: 'contentHtml' } },
}),
contentHtml: text('content_html').$cms({
  plugins: { markdown: { role: 'output' } },
}),
```

### Role Types

| Role     | Form Behavior                              | Example                |
| -------- | ------------------------------------------ | ---------------------- |
| `data`   | Show in form, plugin may provide custom UI | Puck JSON column       |
| `source` | Show in form, triggers transform           | Markdown `content`     |
| `output` | Hidden from form (computed)                | Markdown `contentHtml` |

- **`data`** (default when `true` or no role specified) — the authoritative data column, may have custom editor UI
- **`source`** — user-editable input that gets transformed to an output column
- **`output`** — automatically hidden; populated by plugin transforms

This pattern is forward-compatible with other transform plugins (slugify, search indexing, image thumbnails, etc.).

## Markdown Rendering

Markdown is rendered to HTML **at save time** using an in-process plugin:

1. **Schema-driven scoping** — CMS passes only declared columns via `ctx.columns`
2. **Markdown parser** — [lib/markdown.ts](lib/markdown.ts) wraps `micromark` to render markdown to HTML
3. **HTML sanitizer** — [lib/sanitize.ts](lib/sanitize.ts) uses an allowlist approach (like WordPress wp_kses) to prevent XSS
4. **CMS plugin** — `beforeSave` transform populates `contentHtml` column automatically
5. **Fast reads** — Templates use pre-rendered `contentHtml` column

### XSS Prevention

The sanitizer uses an allowlist approach:

- **Allowed elements**: Only markdown output tags (`p`, `a`, `img`, `strong`, `em`, `code`, `pre`, `ul`, `li`, `h1-h6`, etc.)
- **Allowed attributes**: Per-element allowlist (e.g., `a` can have `href`, `title`; `img` can have `src`, `alt`)
- **URL validation**: `href` and `src` must use safe protocols (`http:`, `https:`, `mailto:`, `tel:`, or relative paths)
- **Event handlers**: All `on*` attributes are stripped (onclick, onerror, etc.)
- **Dangerous elements**: `<script>`, `<iframe>`, `<svg>`, `<style>`, etc. are removed (contents preserved)

This approach:

- Parses markdown once (not on every page view)
- Keeps the rendering logic easy to audit (simple wrapper + sanitizer)
- Demonstrates schema-driven plugin discovery

## Schema

The example includes these tables:

| Table         | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `posts`       | Blog posts with title, content, contentHtml, excerpt, publish status |
| `pages`       | Visual pages edited with Puck (JSON content)                         |
| `authors`     | Content creators with bio                                            |
| `categories`  | Post organization                                                    |
| `media`       | File uploads (images stored as base64 in JSONB)                      |
| `settings`    | Key-value site configuration                                         |
| `admin_users` | CMS authentication                                                   |

## Templates

Templates use `@hotsauce/ui`'s `html` tagged template for XSS-safe rendering:

```typescript
// site/templates.ts
import { html, raw } from '@hotsauce/ui';

function postCard(post: Post): string {
  return html`
    <article>
      <h2>${post.title}</h2>
      <!-- auto-escaped -->
      <div>${raw(post.htmlContent)}</div>
      <!-- trusted HTML -->
    </article>
  `;
}
```

## Public Routes

| Route                 | Description                     |
| --------------------- | ------------------------------- |
| `GET /`               | Homepage with recent posts      |
| `GET /post/:slug`     | Single post page                |
| `GET /page/:slug`     | Static page (about, contact)    |
| `GET /category/:slug` | Posts in a category             |
| `GET /categories`     | All categories with post counts |
| `GET /author/:slug`   | Author profile with their posts |

## CMS Routes

All `/admin/*` routes are handled by hotsauce-cms:

| Route                   | Description                           |
| ----------------------- | ------------------------------------- |
| `GET /admin`            | Dashboard                             |
| `GET /admin/login`      | Login page                            |
| `GET /admin/posts`      | Post management                       |
| `GET /admin/pages`      | Page management                       |
| `GET /admin/authors`    | Author management                     |
| `GET /admin/categories` | Category management                   |
| `GET /admin/settings`   | Site settings (read-only for editors) |

## Customization

### Adding New Routes

Add routes in `site/routes.ts`:

```typescript
app.get('/search', async (c) => {
  const q = c.req.query('q');
  const results = await db.query.posts.findMany({
    where: ilike(posts.title, `%${q}%`),
  });
  // ... render results
});
```

### Styling

Edit `site/static/styles.css` to customize the appearance. The CSS file is served via Hono's static file middleware.

### Adding HTMX

For interactive features without a full SPA, add HTMX:

> Note: This example's default CSP uses `script-src 'none'`, so enabling HTMX (or any client-side JS) requires relaxing the CSP in `security.ts`.

```typescript
// In site/templates.ts layout()
<script src="https://unpkg.com/htmx.org@2"></script>

// In a template
<button hx-post="/api/like/${post.id}" hx-swap="outerHTML">
  👍 ${post.likes}
</button>

// In site/routes.ts
app.post('/api/like/:id', async (c) => {
  // Update likes, return new button HTML
});
```

## Deploying to Deno Deploy

For production deployment:

1. Replace PGlite with a real PostgreSQL database:

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const client = postgres(Deno.env.get('DATABASE_URL')!);
const db = drizzle(client, { schema });
```

2. Set environment variables in Deno Deploy dashboard:
   - `DATABASE_URL` - PostgreSQL connection string
   - `CMS_CSRF_SECRET` - 32+ character secret
   - `CMS_JWT_SECRET` - 32+ character secret

3. Deploy via GitHub integration or `deployctl`

## Notes

- PGlite data is persisted to `./data` directory
- The CMS handles all authentication - no separate auth needed for the frontend
- Settings are read-only for non-admin users (configured via `auth.policies`)
