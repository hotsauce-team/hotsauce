/// <reference path="../../core/extend/drizzle.d.ts" />

// Tests for table-level $cms({ hidden: true }) functionality
// Hidden tables should not appear in the sidebar navigation or dashboard

import { assertEquals } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

// Import extend module for side effects (patches Drizzle prototypes)
import '@hotsauce/core/extend';

import { createCmsHandler } from '../mod.ts';
import type { Handler } from '../types.ts';
import { TEST_CSRF_SECRET } from './integration_helpers.ts';

// ============================================================================
// Test Schema with hidden table
// ============================================================================

// Normal visible table
const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body'),
});

// Table marked as hidden - should not appear in navigation
const internalSettings = pgTable('internal_settings', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 100 }).notNull(),
  value: text('value'),
}).$cms({
  hidden: true,
});

// Another visible table
const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
});

const schema = { posts, internalSettings, categories };

// ============================================================================
// Test Helpers
// ============================================================================

interface TestContext {
  client: PGlite;
  // deno-lint-ignore no-explicit-any
  db: ReturnType<typeof drizzle<any>>;
  handler: Handler;
}

async function setupTestDb(): Promise<TestContext> {
  const client = new PGlite();
  const db = drizzle(client);

  // Create tables
  await db.execute(sql`
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE internal_settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL,
      value TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    )
  `);

  const handler = createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
  });

  return { client, db, handler };
}

async function cleanup(ctx: TestContext): Promise<void> {
  await ctx.client.close();
}

// ============================================================================
// Tests
// ============================================================================

Deno.test('hidden table: dashboard does not show hidden tables', async () => {
  const ctx = await setupTestDb();

  try {
    const response = await ctx.handler(
      new Request('http://localhost/admin'),
    );

    assertEquals(response.status, 200);
    const html = await response.text();

    // Visible tables should appear
    assertEquals(html.includes('Posts'), true, 'Posts table should be visible');
    assertEquals(
      html.includes('Categories'),
      true,
      'Categories table should be visible',
    );

    // Hidden table should NOT appear
    assertEquals(
      html.includes('Internal Settings'),
      false,
      'Internal Settings table should be hidden from dashboard',
    );
    assertEquals(
      html.includes('internal_settings'),
      false,
      'internal_settings should not appear in dashboard links',
    );
  } finally {
    await cleanup(ctx);
  }
});

Deno.test('hidden table: sidebar navigation does not show hidden tables', async () => {
  const ctx = await setupTestDb();

  try {
    // Navigate to the posts list page to see the sidebar
    const response = await ctx.handler(
      new Request('http://localhost/admin/posts'),
    );

    assertEquals(response.status, 200);
    const html = await response.text();

    // Visible tables should appear in navigation
    assertEquals(
      html.includes('href="/admin/posts"'),
      true,
      'Posts link should be in navigation',
    );
    assertEquals(
      html.includes('href="/admin/categories"'),
      true,
      'Categories link should be in navigation',
    );

    // Hidden table should NOT appear in navigation
    assertEquals(
      html.includes('href="/admin/internal_settings"'),
      false,
      'Internal Settings link should NOT be in navigation',
    );
  } finally {
    await cleanup(ctx);
  }
});

Deno.test('hidden table: can still access hidden table via direct URL', async () => {
  const ctx = await setupTestDb();

  try {
    // Insert test data
    await ctx.db.execute(sql`
      INSERT INTO internal_settings (key, value) VALUES ('site_name', 'Test Site')
    `);

    // Direct access to the hidden table's list view should still work
    const listResponse = await ctx.handler(
      new Request('http://localhost/admin/internal_settings'),
    );

    assertEquals(
      listResponse.status,
      200,
      'Should be able to access hidden table directly',
    );
    const html = await listResponse.text();

    // Should show the table content
    assertEquals(
      html.includes('site_name'),
      true,
      'Should show the record data',
    );
  } finally {
    await cleanup(ctx);
  }
});

Deno.test('hidden table: hidden table does not appear on any page navigation', async () => {
  const ctx = await setupTestDb();

  try {
    // Insert test data
    await ctx.db.execute(sql`
      INSERT INTO categories (name) VALUES ('Technology')
    `);

    // Check the categories list page
    const listResponse = await ctx.handler(
      new Request('http://localhost/admin/categories'),
    );
    assertEquals(listResponse.status, 200);
    let html = await listResponse.text();

    assertEquals(
      html.includes('Internal Settings'),
      false,
      'Hidden table should not appear in navigation on list page',
    );

    // Check a detail page
    const detailResponse = await ctx.handler(
      new Request('http://localhost/admin/categories/1'),
    );
    assertEquals(detailResponse.status, 200);
    html = await detailResponse.text();

    assertEquals(
      html.includes('Internal Settings'),
      false,
      'Hidden table should not appear in navigation on detail page',
    );

    // Check create page
    const createResponse = await ctx.handler(
      new Request('http://localhost/admin/categories/new'),
    );
    assertEquals(createResponse.status, 200);
    html = await createResponse.text();

    assertEquals(
      html.includes('Internal Settings'),
      false,
      'Hidden table should not appear in navigation on create page',
    );
  } finally {
    await cleanup(ctx);
  }
});
