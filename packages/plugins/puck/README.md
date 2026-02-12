# @hotsauce/plugins/puck

Puck visual editor plugin for HotSauce CMS.

Adds "Edit with Puck" links to JSON columns and provides routes for the Puck editor UI.

## Installation

```ts
import { createPuckPlugin } from '@hotsauce/plugins/puck';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [createPuckPlugin({ basePath: '/admin' })],
});
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

> **Tip:** Using `{ mode: 'json' }` is recommended so Drizzle handles JSON parsing automatically. The plugin handles both strings and objects, but `mode: 'json'` keeps your application code cleaner.

## How It Works

1. Columns marked with `plugins: { puck: true }` display an "Edit with Puck" button instead of a raw JSON textarea
2. The button links to `/admin/puck/:table/:id/:column` where the Puck editor loads
3. Changes are saved back through the standard CMS CRUD routes

## Plugin Routes

| Route                                | Description              |
| ------------------------------------ | ------------------------ |
| `GET /admin/puck/:table/:id/:column` | Puck editor page         |
| `GET /admin/puck/_assets/bundle.js`  | Editor JavaScript bundle |
| `GET /admin/puck/_assets/puck.css`   | Editor stylesheet        |
