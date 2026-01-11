// Example Drizzle schema for testing CMS introspection (SQLite)
// This represents a typical blog/content site

import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Note: SQLite doesn't support enums natively, so we use text with a check constraint
// The enum values are: 'draft', 'published', 'archived'

// Users table
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email', { length: 255 }).notNull().unique(),
  name: text('name', { length: 100 }).notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url', { length: 500 }),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Posts table
// Note: SQLite doesn't support arrays, so tags is stored as JSON text
export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title', { length: 200 }).notNull(),
  slug: text('slug', { length: 200 }).notNull().unique(),
  excerpt: text('excerpt', { length: 500 }),
  body: text('body'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(), // JSON array instead of native array
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id),
  featuredImageId: text('featured_image_id'), // UUID stored as text
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Categories table
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name', { length: 100 }).notNull(),
  slug: text('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  parentId: integer('parent_id'),
});

// Posts <-> Categories (many-to-many with composite primary key)
export const postsToCategories = sqliteTable(
  'posts_to_categories',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
  },
  (table) => [primaryKey({ columns: [table.postId, table.categoryId] })]
);

// Uploads table
// Note: UUID stored as text in SQLite
export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(), // UUID as text
  filename: text('filename', { length: 255 }).notNull(),
  mimeType: text('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  path: text('path', { length: 500 }).notNull(),
  alt: text('alt', { length: 255 }),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Settings table (key-value with JSON)
export const settings = sqliteTable('settings', {
  key: text('key', { length: 100 }).primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  categories: many(postsToCategories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  posts: many(postsToCategories),
}));

export const postsToCategoriesRelations = relations(
  postsToCategories,
  ({ one }) => ({
    post: one(posts, {
      fields: [postsToCategories.postId],
      references: [posts.id],
    }),
    category: one(categories, {
      fields: [postsToCategories.categoryId],
      references: [categories.id],
    }),
  })
);
