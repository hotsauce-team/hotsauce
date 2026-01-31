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

import '@hotsauce/core/extend';
import type { FileReference } from '@hotsauce/core';
import type { Parsers } from '@hotsauce/handlers';

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
  file: jsonb('file').$type<FileReference>().$cms({ file: true }),
  alt: text('alt'),
  caption: text('caption'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
  content: text('content').notNull(),
  contentHtml: text('content_html').$cms({ hidden: true }), // Rendered markdown (populated by plugin)
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
 * Pages table - static pages (about, contact, etc.)
 */
export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  content: text('content').notNull(),
  contentHtml: text('content_html'), // Rendered markdown (populated by plugin)
  published: boolean('published').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}).$cms({
  frontendUrl: (page) => page.published ? `/page/${page.slug}` : null,
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
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 50 }).default('editor').notNull(),
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
const pagesInsertSchema = createInsertSchema(pages);
const settingsInsertSchema = createInsertSchema(settings);
const adminUsersInsertSchema = createInsertSchema(adminUsers);

const authorsUpdateSchema = createUpdateSchema(authors);
const mediaUpdateSchema = createUpdateSchema(media);
const categoriesUpdateSchema = createUpdateSchema(categories);
const postsUpdateSchema = createUpdateSchema(posts);
const pagesUpdateSchema = createUpdateSchema(pages);
const settingsUpdateSchema = createUpdateSchema(settings);
const adminUsersUpdateSchema = createUpdateSchema(adminUsers);

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
