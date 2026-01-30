# Plugin Routes and Field Overrides

**Status:** Draft  
**Author:** (spec author)  
**Date:** 2026-01-30

## Summary

Extend the worker plugin API to support:
1. Custom HTTP route handling
2. Field UI overrides via templates
3. JSON response format for CRUD endpoints

This enables rich field editors (e.g., Puck visual editor) to be implemented as worker plugins without changes to core architecture.

---

## Motivation

The current worker plugin API only supports data transformation hooks (`beforeSave`, `afterRead`) and action hooks (`on.create`, `on.update`, `on.delete`). This is insufficient for plugins that need to:

- Serve custom UI pages (e.g., visual editors)
- Replace the default form input for specific field types
- Interact with the CMS via API calls

### Use Case: Puck Visual Editor

Puck is a React-based visual page builder. To integrate it:
1. A JSON column marked `$cms({ editor: 'puck' })` should show an "Open Visual Editor" button instead of a textarea
2. Clicking the button opens `/admin/:table/:id/:column/puck`
3. That route serves a standalone HTML page with Puck mounted
4. User edits visually, clicks Save
5. Puck POSTs to the existing CRUD endpoint
6. CMS returns JSON response (success or validation errors)

---

## Specification

### 1. Plugin Route Handling

#### 1.1 Route Declaration

Plugins declare routes they handle via a new `routes` property:

```typescript
interface RoutePattern {
  /**
   * URL pattern relative to the CMS base path.
   * Supports named parameters: `:table`, `:id`, `:column`
   * Example: '/:table/:id/:column/puck'
   */
  pattern: string;
  
  /**
   * HTTP methods this route handles.
   * Example: ['GET', 'POST']
   */
  methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
}

interface PluginConfig {
  name: string;
  worker: Worker;
  hooks?: HookConfig;
  filter?: FilterFn | 'dangerously-open';
  config?: Serializable;
  
  // NEW
  routes?: RoutePattern[];
  fields?: FieldOverride;
}
```

#### 1.2 Route Matching

The router checks plugin routes **before** built-in routes:

```
1. For each registered plugin (in registration order):
   a. For each route in plugin.routes:
      - If pattern matches request path AND method matches:
        - If plugin.filter passes (with hookType: 'route'):
          → Dispatch to plugin worker
2. If no plugin route matched:
   → Use built-in route handlers
```

**Filter context for routes:**
```typescript
{
  hookType: 'route',
  table: string | undefined,   // From URL params if present
  action: 'custom',            // Routes are always 'custom' action
  user: User | null,
  column?: string,             // From URL params if present
}
```

#### 1.3 Route Message Format

When a route matches, CMS sends this message to the worker:

```typescript
interface RouteMessage {
  type: 'route';
  
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  
  /** Full path relative to CMS base (e.g., '/posts/123/content/puck') */
  path: string;
  
  /** Extracted URL parameters */
  params: Record<string, string>;
  
  /** Query string parameters */
  query: Record<string, string>;
  
  /** 
   * Request body. 
   * - For application/json: parsed object
   * - For application/x-www-form-urlencoded: parsed object
   * - For multipart/form-data: parsed object (files as { filename, contentType, size })
   * - Otherwise: raw string
   */
  body: Serializable | null;
  
  /** Subset of request headers (safe headers only, lowercase keys) */
  headers: Record<string, string>;
  
  /** Authenticated user, if any */
  user: SerializableUser | null;
  
  /** Plugin's config from registration */
  config: Serializable;
  
  /** CSRF token for forms that POST back to CMS */
  csrfToken: string;
  
  /** CMS base path (e.g., '/admin') */
  basePath: string;
  
  /** Contextual data from CMS */
  context: RouteContext;
}

interface RouteContext {
  /** 
   * Current value of the column (for column-specific routes).
   * CMS fetches this from database before dispatching.
   * undefined if :column param not present or record not found.
   */
  value?: Serializable;
  
  /**
   * Column metadata (for column-specific routes).
   * undefined if :column param not present.
   */
  columnMeta?: {
    name: string;
    type: string;
    notNull: boolean;
    hasDefault: boolean;
    cms?: Record<string, unknown>;  // From $cms() extension
  };
  
  /**
   * Full record data (for record-specific routes).
   * Filtered by column policies.
   * undefined if :id param not present or record not found.
   */
  record?: Record<string, Serializable>;
}
```

**Headers passed to worker (allowlist):**
- `accept`
- `content-type`
- `accept-language`
- `user-agent`

Other headers are stripped for security.

#### 1.4 Route Response Format

Worker returns:

```typescript
interface RouteResponse {
  /** HTTP status code */
  status: number;
  
  /** Response headers */
  headers: Record<string, string>;
  
  /** Response body (string) */
  body: string;
}
```

Example success:
```typescript
{
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<!DOCTYPE html>...'
}
```

Example redirect:
```typescript
{
  status: 303,
  headers: { 'location': '/admin/posts/123' },
  body: ''
}
```

#### 1.5 Error Handling

If worker throws or times out:
- CMS returns 500 with error page
- Error logged via `onError` callback

If worker returns invalid response:
- CMS returns 500 with error page
- Error logged via `onError` callback

---

### 2. Field UI Overrides

#### 2.1 Field Override Declaration

Plugins can override the form UI for matching columns. The worker renders HTML, which the CMS sanitizes before serving.

```typescript
interface FieldOverride {
  /**
   * Declarative matcher for columns.
   * Matches columns where column.cms contains all specified properties.
   */
  match: Record<string, unknown>;
  
  /**
   * How the field HTML is generated.
   * 'worker' = CMS asks worker for HTML (sanitized before serving)
   */
  render: 'worker';
}
```

Example:
```typescript
{
  name: 'puck-editor',
  worker: puckWorker,
  routes: [...],
  fields: {
    match: { cms: { editor: 'puck' } },
    render: 'worker',
  },
}
```

#### 2.2 Matching Logic

A column matches if its `cms` metadata (from `$cms()` extension) contains all key-value pairs in `match.cms`:

```typescript
function columnMatches(column: ColumnMeta, match: Record<string, unknown>): boolean {
  if (!match.cms) return false;
  const colCms = column.cms ?? {};
  
  for (const [key, value] of Object.entries(match.cms)) {
    if (colCms[key] !== value) return false;
  }
  return true;
}
```

#### 2.3 Field Message Format

When a column matches a plugin's field override, CMS sends this message to the worker:

```typescript
interface FieldMessage {
  type: 'field';
  
  /** Table name */
  table: string;
  
  /** Record ID (undefined on create) */
  id: string | undefined;
  
  /** Column name */
  column: string;
  
  /** Current column value */
  value: Serializable;
  
  /** Column metadata */
  columnMeta: {
    name: string;
    type: string;
    notNull: boolean;
    hasDefault: boolean;
    cms?: Record<string, unknown>;
  };
  
  /** CMS base path */
  basePath: string;
  
  /** CSRF token for forms */
  csrfToken: string;
  
  /** Current user */
  user: SerializableUser | null;
  
  /** Plugin config */
  config: Serializable;
  
  /** Whether this is create or update */
  action: 'create' | 'update';
}
```

#### 2.4 Field Response Format

Worker returns HTML string:

```typescript
interface FieldResponse {
  html: string;
}
```

Example worker implementation:
```typescript
if (msg.type === 'field') {
  const { table, id, column, value, basePath } = msg;
  
  let html;
  if (id) {
    html = `
      <div class="puck-field">
        <a href="${basePath}/${table}/${id}/${column}/puck" class="btn btn-secondary">
          Open Visual Editor →
        </a>
        <input type="hidden" name="${column}" value='${JSON.stringify(value)}' />
        <details>
          <summary>View raw JSON</summary>
          <pre>${JSON.stringify(value, null, 2)}</pre>
        </details>
      </div>
    `;
  } else {
    html = `
      <div class="puck-field">
        <p class="text-muted">Save the record first to enable visual editor.</p>
        <input type="hidden" name="${column}" value='${JSON.stringify(value)}' />
      </div>
    `;
  }
  
  self.postMessage({ html });
}
```

**Note:** The worker doesn't need to escape HTML — the CMS sanitizes everything.

#### 2.5 HTML Sanitization

**The CMS sanitizes all worker-generated field HTML before rendering.** This prevents XSS even if the worker is malicious or buggy.

**Allowed elements:**

| Element | Allowed Attributes |
|---------|-------------------|
| `div` | `class`, `id`, `data-*`, `style` |
| `span` | `class`, `id`, `data-*`, `style` |
| `p` | `class`, `id`, `style` |
| `a` | `href`, `class`, `id`, `target`, `rel`, `style` |
| `button` | `type`, `class`, `id`, `disabled`, `style` |
| `input` | `type`, `name`, `value`, `class`, `id`, `disabled`, `readonly`, `placeholder`, `hidden` |
| `textarea` | `name`, `class`, `id`, `disabled`, `readonly`, `placeholder`, `rows`, `cols` |
| `label` | `for`, `class`, `id`, `style` |
| `select` | `name`, `class`, `id`, `disabled` |
| `option` | `value`, `selected`, `disabled` |
| `details` | `class`, `id`, `open` |
| `summary` | `class`, `id` |
| `pre` | `class`, `id`, `style` |
| `code` | `class`, `id` |
| `strong`, `em`, `b`, `i` | `class`, `id` |
| `ul`, `ol`, `li` | `class`, `id`, `style` |
| `img` | `src`, `alt`, `class`, `id`, `width`, `height`, `style` |
| `br`, `hr` | `class`, `id` |

**Attribute restrictions:**

- `href` — Must start with `/`, `http://`, `https://`, or `#`. No `javascript:`.
- `src` — Must start with `/`, `http://`, or `https://`. No `data:` URLs.
- `style` — Parsed and rebuilt. `url()`, `expression()`, `javascript:` are stripped.
- `data-*` — Any data attribute is allowed.
- `target` — Only `_blank`, `_self`, `_parent`, `_top` allowed.
- `rel` — Auto-adds `noopener noreferrer` when `target="_blank"`.
- `value` — Attribute value is HTML-encoded to prevent injection.

**Disallowed (always stripped):**

- `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<svg>`, `<math>`
- Event handlers: `onclick`, `onload`, `onerror`, `onmouseover`, etc.
- `javascript:` URLs
- `data:` URLs in `src`/`href` attributes

**Implementation:** Use a sanitizer with explicit allowlist. Reference implementation in `packages/ui/sanitize.ts` (to be created). Can adapt logic from `examples/hono-fullstack/lib/sanitize.ts`.

#### 2.6 Rendering Behavior

When rendering a form field:

```
1. For each registered plugin (in registration order):
   a. If plugin.fields exists AND columnMatches(column, plugin.fields.match):
      - If plugin.filter passes (with hookType: 'field'):
        → Send FieldMessage to worker
        → Await FieldResponse
        → Sanitize response.html with allowlist
        → Render sanitized HTML
        → Stop checking other plugins
2. If no plugin matched:
   → Render default field input
```

**Filter context for fields:**
```typescript
{
  hookType: 'field',
  table: string,
  action: 'create' | 'update',
  user: User | null,
  column: string,
}
```

#### 2.7 Timeout and Error Handling

- **Timeout:** Field render has 1000ms timeout. If worker doesn't respond, fall back to default input with warning logged.
- **Invalid response:** If worker returns non-string `html`, fall back to default input with warning logged.
- **Worker error:** If worker throws, fall back to default input with error logged via `onError`.

This ensures a misbehaving plugin never breaks the entire form.

---

### 3. JSON Response Format for CRUD Endpoints

#### 3.1 Accept Header Detection

Existing CRUD handlers (create, update, delete) check the `Accept` header:

```
If request Accept header includes 'application/json':
  → Return JSON response
Else:
  → Return HTML response (redirect or form with errors)
```

#### 3.2 JSON Response Formats

**Success (create):**
```typescript
{
  success: true,
  action: 'create',
  table: 'posts',
  id: '123',  // Created record's primary key
  redirect: '/admin/posts/123'  // Where HTML response would redirect
}
```

**Success (update):**
```typescript
{
  success: true,
  action: 'update',
  table: 'posts',
  id: '123',
  redirect: '/admin/posts/123'
}
```

**Success (delete):**
```typescript
{
  success: true,
  action: 'delete',
  table: 'posts',
  id: '123',
  redirect: '/admin/posts'
}
```

**Validation error:**
```typescript
{
  success: false,
  action: 'update',
  table: 'posts',
  id: '123',
  errors: {
    _form: ['CSRF token invalid'],  // Form-level errors
    title: ['Required'],            // Field-level errors
    content: ['Invalid JSON'],
  }
}
```

**Authorization error:**
```typescript
{
  success: false,
  error: 'forbidden',
  message: 'You do not have permission to update this record'
}
```

**Not found:**
```typescript
{
  success: false,
  error: 'not_found',
  message: 'Record not found'
}
```

#### 3.3 HTTP Status Codes

| Scenario | HTML Response | JSON Response |
|----------|---------------|---------------|
| Success (create) | 303 redirect | 201 Created |
| Success (update) | 303 redirect | 200 OK |
| Success (delete) | 303 redirect | 200 OK |
| Validation error | 200 (re-render form) | 400 Bad Request |
| Auth error | 403 Forbidden | 403 Forbidden |
| Not found | 404 Not Found | 404 Not Found |

---

## Implementation Checklist

### Phase 1: Route Handling

- [ ] Add `routes` property to `PluginConfig` type in `packages/handlers/plugins/types.ts`
- [ ] Update plugin registration validation in `packages/handlers/plugins/registry.ts`
- [ ] Add route matching logic in `packages/handlers/router.ts`
  - [ ] Check plugin routes before built-in routes
  - [ ] Extract URL params from pattern
  - [ ] Check plugin filter with `hookType: 'route'`
- [ ] Add route dispatch in `packages/handlers/plugins/service.ts`
  - [ ] Construct `RouteMessage` with context
  - [ ] Fetch record/column value if params present
  - [ ] Send to worker, await response
  - [ ] Convert `RouteResponse` to `Response`
- [ ] Update `packages/handlers-workers/types.ts` with new message types
- [ ] Update worker executor to handle route messages

### Phase 2: Field UI Overrides

- [ ] Add `fields` property to `PluginConfig` type
- [ ] Add field matching logic in `packages/ui/forms/field.ts` or new module
- [ ] Create `packages/ui/sanitize.ts` with HTML sanitizer (allowlist-based)
- [ ] Add `FieldMessage` dispatch in plugin service
- [ ] Update form rendering to check plugins before default input
- [ ] Pass plugin registry to form rendering context
- [ ] Add 1000ms timeout for field render with fallback

### Phase 3: JSON Response Format

- [ ] Add `Accept` header detection helper in `packages/handlers/http.ts`
- [ ] Update `handleCreate` in `packages/handlers/crud.ts` for JSON response
- [ ] Update `handleUpdate` in `packages/handlers/crud.ts` for JSON response
- [ ] Update `handleDelete` in `packages/handlers/crud.ts` for JSON response
- [ ] Define JSON response types in `packages/handlers/types.ts`

### Phase 4: Documentation & Testing

- [ ] Add tests for route matching in `packages/handlers/tests/router_test.ts`
- [ ] Add tests for route dispatch in `packages/handlers/tests/plugin_routes_test.ts`
- [ ] Add tests for field overrides in `packages/ui/tests/field_override_test.ts`
- [ ] Add tests for JSON responses in `packages/handlers/tests/crud_json_test.ts`
- [ ] Update `packages/handlers/README.md` with new plugin capabilities
- [ ] Add example Puck plugin in `examples/` or `packages/plugins/`

---

## Example: Puck Editor Plugin

Complete plugin configuration:

```typescript
// puck-plugin.ts
const puckWorker = new Worker(
  import.meta.resolve('@hotsauce/plugin-puck/worker'),
  { type: 'module' }
);

export const puckPlugin = {
  name: 'puck-editor',
  worker: puckWorker,
  
  routes: [
    { pattern: '/:table/:id/:column/puck', methods: ['GET'] },
  ],
  
  fields: {
    match: { cms: { editor: 'puck' } },
    render: 'worker',  // Worker renders field HTML, CMS sanitizes it
  },
  
  config: {
    // User's Puck component definitions
    components: {
      Heading: {
        fields: { 
          text: { type: 'text' },
          level: { type: 'select', options: ['h1', 'h2', 'h3'] },
        },
      },
      Paragraph: {
        fields: { 
          content: { type: 'textarea' },
        },
      },
      Image: {
        fields: {
          src: { type: 'text' },
          alt: { type: 'text' },
        },
      },
    },
  },
  
  filter: 'dangerously-open',
};
```

Worker module:

```typescript
// @hotsauce/plugin-puck/worker.ts

self.onmessage = (event: MessageEvent) => {
  const msg = event.data;
  
  // Handle field rendering (for the form input)
  if (msg.type === 'field') {
    const { table, id, column, value, basePath } = msg;
    
    let html;
    if (id) {
      html = `
        <div class="puck-field">
          <a href="${basePath}/${table}/${id}/${column}/puck" 
             class="btn btn-secondary" 
             target="_blank">
            Open Visual Editor →
          </a>
          <input type="hidden" name="${column}" value='${JSON.stringify(value)}' />
          <details style="margin-top: 0.5rem;">
            <summary>View raw JSON</summary>
            <pre style="font-size: 0.75rem; max-height: 200px; overflow: auto;">${JSON.stringify(value, null, 2)}</pre>
          </details>
        </div>
      `;
    } else {
      html = `
        <div class="puck-field">
          <p class="text-muted">Save the record first to enable visual editor.</p>
          <input type="hidden" name="${column}" value='${JSON.stringify(value ?? {})}' />
        </div>
      `;
    }
    
    self.postMessage({ html });
    return;
  }
  
  // Handle route (the full Puck editor page)
  if (msg.type === 'route') {
    const html = renderPuckEditor(msg);
    self.postMessage({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: html,
    });
  }
};

function renderPuckEditor(msg: RouteMessage): string {
  const { params, context, config, csrfToken, basePath } = msg;
  const { table, id, column } = params;
  const value = context.value ?? { content: [], root: { props: {} } };
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit ${column} — HotSauce</title>
  <link rel="stylesheet" href="https://esm.sh/@measured/puck@0.16/puck.css">
  <style>
    body { margin: 0; }
    #puck-root { height: 100vh; }
  </style>
</head>
<body>
  <div id="puck-root"></div>
  
  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18",
      "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime",
      "react-dom/client": "https://esm.sh/react-dom@18/client",
      "@measured/puck": "https://esm.sh/@measured/puck@0.16?external=react,react-dom"
    }
  }
  </script>
  
  <script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Puck } from '@measured/puck';
    
    const initialData = ${JSON.stringify(value)};
    const saveUrl = '${basePath}/${table}/${id}';
    const columnName = '${column}';
    const csrfToken = '${csrfToken}';
    
    const config = {
      components: ${JSON.stringify(buildRenderableComponents(config.components))}
    };
    
    const handlePublish = async (data) => {
      const formData = new FormData();
      formData.append(columnName, JSON.stringify(data));
      formData.append('_csrf', csrfToken);
      
      const response = await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        window.location.href = result.redirect;
      } else {
        alert('Save failed: ' + Object.values(result.errors || {}).flat().join(', '));
      }
    };
    
    createRoot(document.getElementById('puck-root')).render(
      React.createElement(Puck, {
        config,
        data: initialData,
        onPublish: handlePublish,
      })
    );
  </script>
</body>
</html>`;
}

function buildRenderableComponents(componentDefs) {
  // Convert user's component definitions to Puck config
  // This is simplified - real implementation would handle render functions
  return componentDefs;
}
```

Schema usage:

```typescript
// schema.ts
import { pgTable, serial, text, jsonb } from 'drizzle-orm/pg-core';
import '../extend-cms';  // Enables $cms() method

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: jsonb('content').$cms({ editor: 'puck' }),  // ← Triggers Puck UI
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Security Considerations

1. **Route isolation**: Plugin routes run in workers with user-defined permissions. Plugins cannot access database handles or server internals.

2. **Context data filtering**: `context.record` is filtered by column policies before being sent to worker. Hidden columns are not exposed.

3. **CSRF protection**: `csrfToken` is provided for forms that POST back to CMS. Workers cannot forge tokens.

4. **Header allowlist**: Only safe headers are passed to workers. Auth headers, cookies, etc. are stripped.

5. **Response validation**: Worker responses are validated before being served. Invalid responses result in 500 error.

---

## Open Questions

1. **Plugin route priority**: If two plugins declare the same route pattern, which wins? Current spec: first registered plugin wins. Should we error on conflict?

2. **Asset routes**: Should there be a convention for plugin static assets? e.g., `/admin/_plugins/:pluginName/assets/*` routes to a plugin-provided asset handler?

3. **WebSocket support**: Some editors might want real-time collaboration. Out of scope for v1, but should the route API be designed to support upgrade to WebSocket later?

4. **Sanitizer extensibility**: Should plugins be able to declare additional allowed elements/attributes? e.g., a plugin that needs `<canvas>` or custom elements. Risk: expands attack surface. Could require explicit opt-in in CMS config.
