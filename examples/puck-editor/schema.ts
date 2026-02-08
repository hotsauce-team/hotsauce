// Puck Editor Example Schema
// Minimal schema demonstrating the Puck editor plugin
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';

import '@hotsauce/core/extend';
import type { CmsColumnOptions, CmsTableOptions } from '@hotsauce/core/extend';
import type { Parsers } from '@hotsauce/cms';

// ─────────────────────────────────────────────────────────────
// Type declarations for $cms() method on Drizzle columns/tables.
// Required for TypeScript support. Add once per project.
// ─────────────────────────────────────────────────────────────
declare module 'drizzle-orm/pg-core' {
  interface PgColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface PgTable {
    $cms(options: CmsTableOptions): this;
  }
}

// ─────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────

/**
 * Pages table - content pages edited with Puck
 *
 * The `content` column uses .$cms({ plugins: { puck: true } }) to enable
 * the Puck editor plugin, which adds an "Edit with Puck" link in the CMS.
 */
export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  // JSON content edited with Puck visual editor
  content: jsonb('content').$cms({ plugins: { puck: true } }),
  published: boolean('published').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}).$cms({
  frontendUrl: (page) => (page.published ? `/${page.slug}` : null),
});

// ─────────────────────────────────────────────────────────────
// Schema export (for Drizzle and CMS)
// ─────────────────────────────────────────────────────────────

export const schema = {
  pages,
};

// ─────────────────────────────────────────────────────────────
// Zod schemas for validation (used by CMS)
// ─────────────────────────────────────────────────────────────

const pagesInsertSchema = createInsertSchema(pages);
const pagesUpdateSchema = createUpdateSchema(pages);

/**
 * Parsers for CMS form validation
 */
export const parsers: Parsers = {
  pages: {
    insert: (data: unknown) => pagesInsertSchema.parse(data),
    update: (data: unknown) => pagesUpdateSchema.parse(data),
  },
};
