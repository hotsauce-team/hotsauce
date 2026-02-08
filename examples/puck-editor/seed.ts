// Seed script for Puck editor example
// Creates tables and sample data
// deno-lint-ignore-file no-console

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';

import { pages, schema } from './schema.ts';

// ─────────────────────────────────────────────────────────────
// Database Setup
// ─────────────────────────────────────────────────────────────

console.log('🗄️  Connecting to database...');
const client = new PGlite('./data');
const db = drizzle(client, { schema });

// ─────────────────────────────────────────────────────────────
// Clear Existing Data
// ─────────────────────────────────────────────────────────────

console.log('🧹 Clearing existing data...');

await db.execute(sql`DROP TABLE IF EXISTS pages CASCADE`);

// ─────────────────────────────────────────────────────────────
// Create Tables
// ─────────────────────────────────────────────────────────────

console.log('📋 Creating tables...');

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content JSONB,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

// ─────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────

console.log('🌱 Seeding data...');

// Sample Puck content with HeadingBlock
const samplePuckContent = {
  root: { props: {} },
  content: [
    {
      type: 'HeadingBlock',
      props: {
        id: 'HeadingBlock-ae138693-e3d7-4c61-a418-aad713948364',
        children: 'Test',
      },
    },
  ],
  zones: {},
};

// Empty Puck content
const emptyPuckContent = {
  content: [],
  root: { props: {} },
};

await db.insert(pages).values([
  {
    title: 'Home',
    slug: 'home',
    content: samplePuckContent,
    published: true,
    sortOrder: 0,
  },
  {
    title: 'About',
    slug: 'about',
    content: emptyPuckContent,
    published: true,
    sortOrder: 1,
  },
]);

// ─────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────

console.log('');
console.log('✅ Database seeded successfully!');
console.log('');
console.log('🚀 Run the server:');
console.log('   deno task dev');

await client.close();
