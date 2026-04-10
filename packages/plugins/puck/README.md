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

## Image Picker Field

The plugin provides an `ImagePickerField` component for selecting images from CMS tables in Puck's sidebar. This is useful for Image components or any field that references uploaded images.

### Usage

```tsx
import {
  ImagePickerField,
  type SelectedImage,
} from '@hotsauce/plugins/puck/fields';

const Image: ComponentConfig = {
  label: 'Image',
  fields: {
    media: {
      type: 'custom',
      label: 'Image',
      render: ({ value, onChange }) => (
        <ImagePickerField
          value={value as SelectedImage | null}
          onChange={onChange}
          table='media' // Table to pick from (default: 'media')
          column='file' // File column name (default: 'file')
        />
      ),
    },
    alt: { type: 'text', label: 'Alt Text' },
  },
  render: ({ media, alt }) => {
    const m = media as SelectedImage | null;
    if (!m?.id) return <div>No image selected</div>;
    return <img src={`/files/${m.table}/${m.id}`} alt={alt as string} />;
  },
};
```

### SelectedImage Type

The picker stores a reference to the image record, not the image data itself:

```ts
type SelectedImage = {
  id: number; // Primary key of the record
  table: string; // Table name (e.g., 'media', 'photos')
  column: string; // File column name (e.g., 'file', 'image')
  alt?: string; // Alt text from the record (if available)
  filename?: string; // Original filename (for display and SEO-friendly URLs)
};
```

URLs are constructed at render time using file proxy routes. When `filename` is available, it's appended for SEO-friendly URLs:

- Editor: `/admin/files/{table}/{column}/{id}[/{filename}]`
- Frontend: `/files/{table}/{id}[/{filename}]` (you provide this route)

### Props

| Prop       | Type                                     | Default    | Description                   |
| ---------- | ---------------------------------------- | ---------- | ----------------------------- |
| `value`    | `SelectedImage \| null`                  | —          | Current selection             |
| `onChange` | `(value: SelectedImage \| null) => void` | —          | Called when selection changes |
| `basePath` | `string`                                 | `'/admin'` | CMS base path                 |
| `table`    | `string`                                 | `'media'`  | Table to pick from            |
| `column`   | `string`                                 | `'file'`   | File column on the table      |
| `altField` | `string`                                 | `'alt'`    | Column to use for alt text    |

### How It Works

1. User clicks "Pick Image" → Opens a `<dialog>` modal
2. Modal contains an iframe pointing to `{basePath}/{table}?picker=true`
3. CMS renders a minimal grid view (no sidebar, picker mode)
4. User clicks an image → CMS posts `cms:media-selected` to parent window
5. Component captures the message and calls `onChange` with the selection

This uses the CMS [picker mode](../cms/README.md) feature, which works with any table that has a `thumbnail: true` column.

## Example Project

See `apps/demo/` for a complete working example with Puck integration.
