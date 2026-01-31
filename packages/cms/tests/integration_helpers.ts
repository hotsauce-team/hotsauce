// Shared helpers and schemas for integration tests
// This module is used by all integration test files

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Import extend module for side effects (patches Drizzle prototypes)
import '@hotsauce/core/extend';

// Test secrets (long enough to pass validation)
export const TEST_CSRF_SECRET =
  'test-csrf-secret-for-integration-tests-min-32-chars';
export const AUTH_SECRET =
  'test-auth-secret-must-be-at-least-32-characters-long';

// ============================================================================
// Test Schemas
// ============================================================================

// Basic schema - users and posts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  bio: text('bio'),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
  authorId: integer('author_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(posts, {
    fields: [posts.authorId],
    references: [posts.id],
  }),
}));

// Admin users table for auth testing
export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
});

// Schema with file columns for file upload testing
export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  avatar: json('avatar').$cms({ file: true }),
  document: json('document').$cms({
    file: true,
    accept: 'application/pdf',
    maxSize: 1024 * 1024, // 1MB
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Combined schemas
export const schema = { users, posts, usersRelations, postsRelations };
export const schemaWithAuth = { ...schema, adminUsers };
export const schemaWithFiles = { profiles };

// ============================================================================
// Database Setup Helpers
// ============================================================================

// Use a generic database type that works with any schema
// deno-lint-ignore no-explicit-any
type AnyDb = ReturnType<typeof drizzle<any>>;

export interface TestDbContext {
  client: PGlite;
  db: AnyDb;
  resetDb: () => Promise<void>;
}

/**
 * Create basic tables (users, posts)
 */
export async function createBasicTables(db: AnyDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      bio TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Create admin_users table for auth tests
 */
export async function createAdminUsersTable(db: AnyDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE admin_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);
}

/**
 * Create profiles table for file upload tests
 */
export async function createProfilesTable(db: AnyDb): Promise<void> {
  await db.execute(sql`
    CREATE TABLE profiles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      avatar JSON,
      document JSON,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Setup a test database with basic tables
 */
export async function setupTestDb(): Promise<TestDbContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  await createBasicTables(db);

  const resetDb = async () => {
    await db.execute(sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`);
  };

  return { client, db, resetDb };
}

/**
 * Setup a test database with basic + auth tables
 */
export async function setupTestDbWithAuth(): Promise<TestDbContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  await createBasicTables(db);
  await createAdminUsersTable(db);

  const resetDb = async () => {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users RESTART IDENTITY CASCADE`,
    );
  };

  return { client, db, resetDb };
}

// ============================================================================
// Form Helpers
// ============================================================================

/**
 * Create a FormData object from a key-value record
 */
export function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

/**
 * Create a multipart form request body with file
 */
export function createMultipartBody(
  fields: Record<string, string>,
  file?: { name: string; fieldName: string; content: Uint8Array; type: string },
): { body: FormData } {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  if (file) {
    // Use slice to get a proper ArrayBuffer from Uint8Array
    const blob = new Blob([file.content.slice().buffer], { type: file.type });
    formData.append(file.fieldName, blob, file.name);
  }

  return { body: formData };
}

// ============================================================================
// Test Data Helpers
// ============================================================================

// 1x1 PNG pixels for testing
export const TEST_PNG_1X1_RED = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x02,
  0x00,
  0x00,
  0x00,
  0x90,
  0x77,
  0x53,
  0xde,
  0x00,
  0x00,
  0x00,
  0x0c,
  0x49,
  0x44,
  0x41,
  0x54,
  0x08,
  0xd7,
  0x63,
  0xf8,
  0xcf,
  0xc0,
  0x00,
  0x00,
  0x01,
  0x01,
  0x00,
  0x05,
  0xfe,
  0xab,
  0x9e,
  0x4a,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44,
  0xae,
  0x42,
  0x60,
  0x82,
]);

// Simple PDF header for testing (not a valid PDF, but looks like one)
export const TEST_PDF_HEADER = new Uint8Array([
  0x25,
  0x50,
  0x44,
  0x46,
  0x2d,
  0x31,
  0x2e,
  0x34, // %PDF-1.4
  0x0a,
  0x25,
  0xc7,
  0xec,
  0x8f,
  0xa2, // newline + binary marker
]);
