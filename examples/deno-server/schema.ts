import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import '@drizzle-cms/core/extend';

import { z } from 'zod/v4';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import type { Parsers } from '../../packages/handlers/mod.ts';

/**
 * Users table
 *
 * Used for both app users and CMS authentication.
 * Users with a passwordHash can log in to the CMS.
 * The role field controls CMS permissions.
 */
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'), // required for cms password login only
  totpSecret: text('totp_secret'), // for 2FA (base32 encoded)
  role: varchar('role', { length: 50 }), // 'admin', 'editor', etc.
  avatar: jsonb('avatar').$cms({ file: true }),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Custom validation: add email format validation
// (drizzle-zod generates the base schema, we just add refinements)
const usersInsertSchema = createInsertSchema(users, { email: z.email() });
const usersUpdateSchema = createUpdateSchema(users, {
  email: z.email().optional(),
});

/**
 * Posts table
 */
const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull(),
  content: text('content'),
  published: boolean('published').default(false),
  authorId: integer('author_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * Categories table
 */
const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
});

/**
 * Junction table for many-to-many: posts <-> categories
 */
const postCategories = pgTable('post_categories', {
  postId: integer('post_id').notNull().references(() => posts.id),
  categoryId: integer('category_id').notNull().references(() => categories.id),
}, (table) => [primaryKey({ columns: [table.postId, table.categoryId] })]);

/**
 * Drizzle schema export
 */
export const schema = {
  users,
  posts,
  categories,
  postCategories,
};

/**
 * Export tables for direct use in queries
 */
export { categories, postCategories, posts, users };

/**
 * Custom parsers (optional)
 *
 * Only define parsers for tables that need custom validation.
 * Tables without parsers use auto-generated drizzle-zod schemas.
 *
 * posts and categories use the default drizzle-zod validation.
 */
export const parsers: Parsers = {
  users: {
    insert: (data) => usersInsertSchema.parse(data),
    update: (data) => usersUpdateSchema.parse(data),
  },
};
