// Seed script — Spice Rack demo
// Thin orchestrator: sets up tables and inserts data from seed/data.ts
// deno-lint-ignore-file no-console

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { hashPassword } from '@hotsauce/cms';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';

import {
  makers,
  media,
  pages,
  sauces,
  schema,
  settings,
  users,
} from '../schema.ts';

import {
  adminUserData,
  makersData,
  mediaData,
  pagesData,
  saucesData,
  settingsData,
} from './data.ts';

// ─────────────────────────────────────────────────────────────
// Database Setup
// seed.ts creates its own connection so it can close it when done
// ─────────────────────────────────────────────────────────────

console.log('🗄️  Connecting to database...');
const dataDir = Deno.env.get('PGLITE_DATA_DIR') ?? './data';
const client = new PGlite(dataDir);
const db = drizzle(client, { schema });

// ─────────────────────────────────────────────────────────────
// Clear Existing Data
// ─────────────────────────────────────────────────────────────

console.log('🧹 Clearing existing data...');

// Drop in reverse FK order
await db.execute(sql`DROP TABLE IF EXISTS sauces CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS pages CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS users CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS media CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS makers CASCADE`);

// ─────────────────────────────────────────────────────────────
// Create Tables
// ─────────────────────────────────────────────────────────────

console.log('📋 Creating tables...');

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS makers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    bio TEXT,
    bio_html TEXT,
    logo JSONB,
    website VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    file JSONB,
    alt TEXT,
    caption TEXT,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS sauces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    maker_id INTEGER NOT NULL REFERENCES makers(id),
    heat INTEGER NOT NULL,
    scoville INTEGER,
    bottle JSONB,
    tasting_notes TEXT NOT NULL,
    tasting_notes_html TEXT,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    slug VARCHAR(255) UNIQUE,
    content JSONB,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'editor' NOT NULL,
    avatar JSONB,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`);

// ─────────────────────────────────────────────────────────────
// Seed Data
// ─────────────────────────────────────────────────────────────

console.log('🌱 Seeding data...');

// Settings
await db.insert(settings).values(settingsData).onConflictDoNothing();

// Admin user
const passwordHash = await hashPassword('admin123');
await db.insert(users).values({ ...adminUserData, passwordHash })
  .onConflictDoNothing();

// Media library
await db.insert(media).values(mediaData).onConflictDoNothing();

// Makers — render bio markdown to HTML inline
const makersWithHtml = makersData.map((m) => ({
  ...m,
  bioHtml: m.bio ? sanitizeHtml(parseMarkdown(m.bio)) : null,
}));
await db.insert(makers).values(makersWithHtml).onConflictDoNothing();

// Build slug → id map for FK resolution
const makerRows = await db.select().from(makers);
const makerIdBySlug = Object.fromEntries(makerRows.map((m) => [m.slug, m.id]));

// Sauces — resolve makerSlug → makerId, render tasting notes to HTML
const saucesInsert = [];
for (const sauce of saucesData) {
  const { makerSlug, ...rest } = sauce;
  const makerId = makerIdBySlug[makerSlug];
  if (!makerId) {
    console.warn(
      `  ⚠️  Skipping "${sauce.name}" — maker "${makerSlug}" not found`,
    );
    continue;
  }
  saucesInsert.push({
    ...rest,
    makerId,
    tastingNotesHtml: sanitizeHtml(parseMarkdown(rest.tastingNotes)),
  });
}
if (saucesInsert.length > 0) {
  await db.insert(sauces).values(saucesInsert).onConflictDoNothing();
}

// Pages
await db.insert(pages).values(pagesData).onConflictDoNothing();

// ─────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────

const published = saucesData.filter((s) => s.published).length;
const drafts = saucesData.filter((s) => !s.published).length;

console.log('');
console.log('✅ Database seeded successfully!');
console.log('');
console.log('📊 Created:');
console.log(`   - ${makersData.length} makers`);
console.log(`   - ${published} published sauces + ${drafts} draft`);
console.log(`   - ${pagesData.length} pages`);
console.log(`   - ${mediaData.length} media items`);
console.log(`   - ${settingsData.length} settings`);
console.log('   - 1 admin user');
console.log('');
console.log('🔐 Admin credentials:');
console.log('   Email: admin@example.com');
console.log('   Password: admin123');
console.log('');
console.log(
  '🚀 Run "deno task all:watch" to start the dev server in watch mode',
);

// Close the connection
await client.close();
