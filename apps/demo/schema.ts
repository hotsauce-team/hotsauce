// Blog schema for Hono frontend demo
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import '@hotsauce/core/extend';
import type {
  CmsColumnOptions,
  CmsTableOptions,
  FileReference,
} from '@hotsauce/core/extend';
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
 * Authors table - content creators
 */
export const authors = pgTable('authors', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Media table - uploaded files (images, documents, etc.)
 */
export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  file: jsonb('file').$type<FileReference>().$cms({
    file: { accept: 'image/*' },
    thumbnail: true,
  }),
  alt: text('alt'),
  caption: text('caption'),
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}).$cms({ autoDraft: true });

/**
 * Categories table - post organization
 */
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
});

/**
 * Posts table - main content
 */
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  excerpt: text('excerpt'),
  // Markdown content - transformed to HTML by markdown plugin
  content: text('content').notNull().$cms({
    plugins: { markdown: { role: 'source', output: 'contentHtml' } },
  }),
  // Rendered HTML - populated automatically by markdown plugin
  contentHtml: text('content_html').$cms({
    plugins: { markdown: { role: 'output' } },
  }),
  published: boolean('published').default(false).notNull(),
  authorId: integer('author_id')
    .notNull()
    .references(() => authors.id),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}).$cms({
  frontendUrl: (post) => post.published ? `/post/${post.slug}` : null,
});

/**
 * Pages table - visual pages edited with Puck
 * Uses JSONB content with Puck visual editor (vs posts which use markdown)
 */
export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }),
  slug: varchar('slug', { length: 255 }).unique()
    .$defaultFn(() => `draft-${crypto.randomUUID().slice(0, 8)}`),
  // JSON content edited with Puck visual editor
  content: jsonb('content').$cms({ plugins: { puck: true } }),
  published: boolean('published').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}).$cms({
  autoDraft: true,
  frontendUrl: (page) => page.published ? `/${page.slug}` : null,
});

/**
 * Site settings - key/value configuration
 */
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
});

/**
 * Admin users - CMS authentication
 */
export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull().$cms({
    hidden: true,
  }),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 50 }).default('editor').notNull(),
  avatar: jsonb('avatar').$type<FileReference>().$cms({
    // 20KB - always stored in database
    file: { maxSize: 20 * 1024 },
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const authorsRelations = relations(authors, ({ many }) => ({
  posts: many(posts),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(authors, {
    fields: [posts.authorId],
    references: [authors.id],
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
}));

// ─────────────────────────────────────────────────────────────
// Schema export (for Drizzle and CMS)
// ─────────────────────────────────────────────────────────────

export const schema = {
  authors,
  media,
  categories,
  posts,
  pages,
  settings,
  adminUsers,
  // Relations
  authorsRelations,
  categoriesRelations,
  postsRelations,
};

// ─────────────────────────────────────────────────────────────
// Zod schemas for validation (used by CMS)
// ─────────────────────────────────────────────────────────────

const authorsInsertSchema = createInsertSchema(authors);
const mediaInsertSchema = createInsertSchema(media);
const categoriesInsertSchema = createInsertSchema(categories);
const postsInsertSchema = createInsertSchema(posts);
const settingsInsertSchema = createInsertSchema(settings);
const adminUsersInsertSchema = createInsertSchema(adminUsers);

const authorsUpdateSchema = createUpdateSchema(authors);
const mediaUpdateSchema = createUpdateSchema(media);
const categoriesUpdateSchema = createUpdateSchema(categories);
const postsUpdateSchema = createUpdateSchema(posts);
const settingsUpdateSchema = createUpdateSchema(settings);
const adminUsersUpdateSchema = createUpdateSchema(adminUsers);

// Pages: require title and slug when publishing
function requireTitleSlugWhenPublished(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
) {
  if (data.published) {
    if (!data.title || (typeof data.title === 'string' && !data.title.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Title is required when publishing',
        path: ['title'],
      });
    }
    if (!data.slug || (typeof data.slug === 'string' && !data.slug.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Slug is required when publishing',
        path: ['slug'],
      });
    }
  }
}
const pagesInsertSchema = createInsertSchema(pages).superRefine(
  requireTitleSlugWhenPublished,
);
const pagesUpdateSchema = createUpdateSchema(pages).superRefine(
  requireTitleSlugWhenPublished,
);

/**
 * Parsers for CMS form validation
 */
export const parsers: Parsers = {
  authors: {
    insert: (data: unknown) => authorsInsertSchema.parse(data),
    update: (data: unknown) => authorsUpdateSchema.parse(data),
  },
  media: {
    insert: (data: unknown) => mediaInsertSchema.parse(data),
    update: (data: unknown) => mediaUpdateSchema.parse(data),
  },
  categories: {
    insert: (data: unknown) => categoriesInsertSchema.parse(data),
    update: (data: unknown) => categoriesUpdateSchema.parse(data),
  },
  posts: {
    insert: (data: unknown) => postsInsertSchema.parse(data),
    update: (data: unknown) => postsUpdateSchema.parse(data),
  },
  pages: {
    insert: (data: unknown) => pagesInsertSchema.parse(data),
    update: (data: unknown) => pagesUpdateSchema.parse(data),
  },
  settings: {
    insert: (data: unknown) => settingsInsertSchema.parse(data),
    update: (data: unknown) => settingsUpdateSchema.parse(data),
  },
  adminUsers: {
    insert: (data: unknown) => adminUsersInsertSchema.parse(data),
    update: (data: unknown) => adminUsersUpdateSchema.parse(data),
  },
};
