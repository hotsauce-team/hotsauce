# @hotsauce/plugins/puck

Puck visual editor plugin for HotSauce CMS.

Adds "Edit with Puck" links to JSON columns and provides routes for the Puck editor UI.

## Overview

This plugin is **version-agnostic** — you provide your own Puck bundle and CSS. This allows you to:

- Control the Puck version
- Include your own React components
- Use the same components for both editing and frontend rendering

## Installation

```ts
import { createPuckPlugin } from '@hotsauce/plugins/puck';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    createPuckPlugin({
      basePath: '/admin',
      clientBundle: '/admin/puck-bundle.js', // Your bundle
      clientCss: '/admin/puck-bundle.css', // Your CSS
    }),
  ],
});
```

## User-Provided Bundle

You build your own Puck client bundle that includes:

- React and ReactDOM
- `@puckeditor/core`
- Your component definitions
- Initialization code that reads bootstrap data

### Example Client Entry

```tsx
// admin/puck-client.tsx
import { createRoot } from 'react-dom/client';
import { Puck } from '@puckeditor/core';
import { components } from '../components'; // Your components

interface Bootstrap {
  table: string;
  recordId: string;
  column: string;
  csrfToken: string;
  sourceToken: string;
  basePath: string;
  data: { content: unknown[]; root: { props: Record<string, unknown> } };
}

function init() {
  const bootstrap: Bootstrap = JSON.parse(
    document.getElementById('puck-bootstrap')!.textContent!,
  );

  createRoot(document.getElementById('puck-root')!).render(
    <Puck
      config={{ components }}
      data={bootstrap.data}
      onPublish={async (data) => {
        const form = new FormData();
        form.append(bootstrap.column, JSON.stringify(data));
        form.append('_csrf', bootstrap.csrfToken);
        form.append('_source', bootstrap.sourceToken);
        await fetch(
          `${bootstrap.basePath}/${bootstrap.table}/${bootstrap.recordId}`,
          { method: 'POST', body: form },
        );
      }}
    />,
  );
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
```

### Build with Deno

```ts
// build-puck.ts
const result = await Deno.bundle({
  entrypoints: ['./admin/puck-client.tsx'],
  platform: 'browser',
  minify: true,
});
await Deno.writeTextFile(
  './admin/puck-bundle.js',
  result.outputFiles[0].text(),
);

// Also fetch Puck CSS
const css =
  await (await fetch('https://esm.sh/@puckeditor/core@0.21.1/puck.css')).text();
await Deno.writeTextFile('./admin/puck-bundle.css', css);
```

```bash
deno run --unstable-bundle --allow-read --allow-write --allow-net build-puck.ts
```

## Schema Setup

Mark JSON columns with `.$cms({ plugins: { puck: true } })`:

### PostgreSQL

```ts
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';
import '@hotsauce/core/extend'; // Adds .$cms() method

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: jsonb('content').$cms({ plugins: { puck: true } }),
});
```

### SQLite

For SQLite, use `{ mode: 'json' }` so Drizzle automatically parses the JSON:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import '@hotsauce/core/extend';

export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  // mode: 'json' ensures Drizzle returns parsed objects, not strings
  content: text('content', { mode: 'json' }).$cms({ plugins: { puck: true } }),
});
```

> **Tip:** Using `{ mode: 'json' }` is recommended so Drizzle handles JSON parsing automatically.

## How It Works

1. Columns marked with `plugins: { puck: true }` display an "Edit with Puck" button
2. The button links to `/admin/puck/:table/:id/:column`
3. Plugin serves an HTML shell with bootstrap data (CSRF, source token, initial data)
4. Your bundle loads and mounts the Puck editor
5. Changes are saved back through the standard CMS CRUD routes

## Plugin Routes

| Route                                | Description                   |
| ------------------------------------ | ----------------------------- |
| `GET /admin/puck/:table/:id/:column` | Puck editor page (HTML shell) |

## Example Project

See `apps/demo/` for a complete working example with Puck integration.
