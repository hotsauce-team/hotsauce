// Minimal schema for a markdown-based marketing site

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import '@hotsauce/core/extend';
import type { CmsColumnOptions, CmsTableOptions } from '@hotsauce/core/extend';

// ─────────────────────────────────────────────────────────────
// Type declarations for $cms() method on Drizzle columns/tables.
// Required for TypeScript support. Add once per project.
// ─────────────────────────────────────────────────────────────
declare module 'drizzle-orm/sqlite-core' {
  interface SQLiteColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface SQLiteTable {
    $cms(options: CmsTableOptions): this;
  }
}

// Admin users for CMS authentication
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$default(() => crypto.randomUUID()).$cms({
    hidden: true,
  }),
  email: text('email', { length: 200 }).notNull().unique(),
  passwordHash: text('password_hash').notNull().$cms({ hidden: true }),
  name: text('name', { length: 200 }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$default(() =>
    new Date()
  ).notNull().$cms({ hidden: true }),
});

// Pages with markdown content
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }).$cms({
    hidden: true,
  }),
  slug: text('slug', { length: 200 }).notNull().unique(),
  title: text('title', { length: 200 }).notNull(),
  content: text('content').notNull(), // Markdown
  sortOrder: integer('sort_order').notNull().default(0).$cms({
    hidden: true,
  }),
}).$cms({ frontendUrl: (row) => row ? `/${row.slug}` : undefined });
