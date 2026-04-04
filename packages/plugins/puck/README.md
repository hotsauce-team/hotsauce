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
      componentsJs: '/admin/components.js', // Your bundled components
      componentsCss: '/admin/components.css', // Optional: custom styles
    }),
  ],
});
```

## User-Provided Components

You provide a components file that exports `puckProps` containing:

- Your Puck `config` with component definitions
- Any additional Puck props (viewports, permissions, overrides, etc.)

The plugin automatically includes React, ReactDOM, and Puck's editor bundle.

### Example Components File

Export a `puckProps` object containing your Puck configuration:

```tsx
// components.tsx
import type { ComponentConfig, PuckProps } from '@hotsauce/plugins/puck';
import { DropZone, React } from '@hotsauce/plugins/puck/client/globals';

// Define your components
const Heading: ComponentConfig = {
  fields: { text: { type: 'text' } },
  render: ({ text }) => <h1>{text}</h1>,
};

const Columns: ComponentConfig = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ flex: 1 }}>
        <DropZone zone='left' />
      </div>
      <div style={{ flex: 1 }}>
        <DropZone zone='right' />
      </div>
    </div>
  ),
};

// Export puckProps with config and any Puck props you want
export const puckProps: PuckProps = {
  config: {
    components: { Heading, Columns },
  },
  // Optional: customize Puck behavior
  viewports: [
    { width: 1440, label: 'Desktop', icon: 'Monitor' },
    { width: 768, label: 'Tablet', icon: 'Tablet' },
    { width: 375, label: 'Mobile', icon: 'Smartphone' },
  ],
  // iframe: { enabled: true },
  // onPublish: async (data) => { ... }, // Override save behavior
};
```

The `globals.ts` helper provides pre-typed React and DropZone from `globalThis`, so you don't need to set up React imports manually.

### Build with Deno

```bash
# Bundle components for browser
deno bundle --platform browser --minify components.tsx -o admin/components.js

# Fetch Puck CSS (or bundle your own)
curl -o admin/puck.css https://esm.sh/@puckeditor/core@0.21.1/puck.css
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

### CSP

The editor route automatically declares `csp: { styleSrc: ["'unsafe-inline'"] }` because Puck/React sets inline `style` attributes on DOM elements at runtime (drag handles, overlays, positioning). This is merged with the global CSP at startup — only the editor route is relaxed; asset routes remain strict. No user configuration needed.

## Frontend Rendering (SSR)

For server-side rendering of Puck content, use the `/rsc` export to avoid browser dependencies:

```tsx
// site/render.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type Config, type Data } from '@puckeditor/core';
import { Render } from '@puckeditor/core/rsc';

// Set globalThis.React before importing components
(globalThis as any).React = React;

export async function renderPuckContent(
  data: Data,
  config: Config,
): Promise<string> {
  const element = <Render config={config} data={data} />;
  return renderToStaticMarkup(element);
}
```

The `/rsc` export is lighter and doesn't pull in browser-only dependencies like `happy-dom`.

## Example Project

See `apps/demo/` for a complete working example with Puck integration.
