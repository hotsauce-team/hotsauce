// Seed script for Hono frontend demo
// Creates tables and populates with sample data
// deno-lint-ignore-file no-console

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { hashPassword } from '@hotsauce/cms';
import type { FileReference } from '@hotsauce/core';
import { parseMarkdown } from './lib/markdown.ts';
import { sanitizeHtml } from './lib/sanitize.ts';

import {
  adminUsers,
  authors,
  categories,
  media,
  pages,
  posts,
  schema,
  settings,
} from './schema.ts';

// ─────────────────────────────────────────────────────────────
// Database Setup
// Note: seed.ts creates its own connection so it can close it when done
// ─────────────────────────────────────────────────────────────

console.log('🗄️  Connecting to database...');
const client = new PGlite('./data');
const db = drizzle(client, { schema });

// ─────────────────────────────────────────────────────────────
// Clear Existing Data
// ─────────────────────────────────────────────────────────────

console.log('🧹 Clearing existing data...');

// Drop tables in reverse dependency order to avoid foreign key conflicts
await db.execute(sql`DROP TABLE IF EXISTS posts CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS pages CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS admin_users CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS media CASCADE`);
await db.execute(sql`DROP TABLE IF EXISTS authors CASCADE`);

// ─────────────────────────────────────────────────────────────
// Create Tables
// ─────────────────────────────────────────────────────────────

console.log('📋 Creating tables...');

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS authors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    bio TEXT,
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
  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0 NOT NULL
  )
`);

await db.execute(sql`
  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL,
    content_html TEXT,
    published BOOLEAN DEFAULT FALSE NOT NULL,
    author_id INTEGER NOT NULL REFERENCES authors(id),
    category_id INTEGER REFERENCES categories(id),
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
  CREATE TABLE IF NOT EXISTS admin_users (
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
await db.insert(settings).values([
  {
    key: 'site_name',
    value: 'The Hono Blog',
    description: 'Site title displayed in header',
  },
  {
    key: 'tagline',
    value: 'A demo blog powered by hotsauce-cms + Hono',
    description: 'Tagline shown under site title',
  },
  {
    key: 'footer_text',
    value: '© 2026 The Hono Blog. All rights reserved.',
    description: 'Footer copyright text',
  },
]).onConflictDoNothing();

// Admin user
const passwordHash = await hashPassword('admin123');
await db.insert(adminUsers).values({
  email: 'admin@example.com',
  passwordHash,
  name: 'Admin User',
  role: 'admin',
}).onConflictDoNothing();

// Authors
const [author1] = await db.insert(authors).values({
  name: 'Jane Developer',
  slug: 'jane-developer',
  email: 'jane@example.com',
  bio:
    'Full-stack developer passionate about TypeScript, Deno, and building great developer experiences.',
}).onConflictDoNothing().returning();

const [author2] = await db.insert(authors).values({
  name: 'Alex Writer',
  slug: 'alex-writer',
  email: 'alex@example.com',
  bio: 'Technical writer who loves explaining complex topics in simple terms.',
}).onConflictDoNothing().returning();

// Use existing authors if insert was skipped
const authorList = await db.select().from(authors);
const authorJane = author1 ??
  authorList.find((a) => a.slug === 'jane-developer');
const authorAlex = author2 ?? authorList.find((a) => a.slug === 'alex-writer');

// Media items
const [media1] = await db.insert(media).values({
  file: {
    filename: 'hono-logo.png',
    contentType: 'image/png',
    size: 87,
    // 20x20 orange PNG placeholder - base64 encoded (stored in DB, not S3)
    data:
      'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAHklEQVR42mP438Dwn5qYYdTAUQNHDRw1cNTAkWogAE/x5Q5+gLGvAAAAAElFTkSuQmCC',
  },
  alt: 'Hono framework logo',
  caption: 'The lightweight web framework that works everywhere',
  published: true,
}).onConflictDoNothing().returning();

const [media2] = await db.insert(media).values({
  file: {
    filename: 'drizzle-logo.png',
    contentType: 'image/png',
    size: 86,
    // 20x20 blue PNG placeholder - base64 encoded (stored in DB, not S3)
    data:
      'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAHUlEQVR42mNgqPj/n6p41MBRA0cNHDVw1MCRaiAAnUzYjujdTh0AAAAASUVORK5CYII=',
  },
  alt: 'Drizzle ORM logo',
  caption: 'TypeScript ORM that feels like magic',
  published: true,
}).onConflictDoNothing().returning();

const [media3] = await db.insert(media).values({
  file: {
    filename: 'deno-logo.svg',
    contentType: 'image/svg+xml',
    size: 387,
    // Base64 blob stored in DB - will be served via /admin/files/media/file/:id
    data:
      'PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzAwMDAwMCIvPgogIDxjaXJjbGUgY3g9IjM1IiBjeT0iNDAiIHI9IjUiIGZpbGw9IiNmZmZmZmYiLz4KICA8Y2lyY2xlIGN4PSI2NSIgY3k9IjQwIiByPSI1IiBmaWxsPSIjZmZmZmZmIi8+CiAgPHBhdGggZD0iTSAzMCA3MCBRIDU0IDg1IDc4IDcwIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIvPgo8L3N2Zz4=',
  },
  alt: 'Deno runtime logo',
  caption: 'A modern runtime for JavaScript and TypeScript',
}).onConflictDoNothing().returning();

// Use existing media if insert was skipped
const mediaList = await db.select().from(media);
const honoLogo = media1 ?? mediaList[0];
const drizzleLogo = media2 ?? mediaList[1];
const denoLogo = media3 ?? mediaList[2];

// Categories
const [catTutorials] = await db.insert(categories).values({
  name: 'Tutorials',
  slug: 'tutorials',
  description: 'Step-by-step guides to help you learn new skills',
  sortOrder: 1,
}).onConflictDoNothing().returning();

const [catNews] = await db.insert(categories).values({
  name: 'News',
  slug: 'news',
  description: 'Updates and announcements about the project',
  sortOrder: 2,
}).onConflictDoNothing().returning();

const [catOpinion] = await db.insert(categories).values({
  name: 'Opinion',
  slug: 'opinion',
  description: 'Thoughts and perspectives on web development',
  sortOrder: 3,
}).onConflictDoNothing().returning();

// Use existing categories if insert was skipped
const categoryList = await db.select().from(categories);
const tutorials = catTutorials ??
  categoryList.find((c) => c.slug === 'tutorials');
const news = catNews ?? categoryList.find((c) => c.slug === 'news');
const opinion = catOpinion ?? categoryList.find((c) => c.slug === 'opinion');

/** Helper to create post data with pre-rendered HTML */
function postData(data: {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published: boolean;
  authorId: number;
  categoryId: number;
}) {
  return {
    ...data,
    contentHtml: sanitizeHtml(parseMarkdown(data.content)),
  };
}

/** Helper to get media URL - uses public file serving for database-stored files */
function getMediaUrl(mediaItem: typeof media.$inferSelect): string {
  const file: FileReference | null = mediaItem.file;
  if (!file) return '';
  if (file.data) return `/files/media/${mediaItem.id}`;
  return file.url || '';
}

/** Helper to create Puck page content */
function puckContent(
  blocks: Array<{ type: string; props: Record<string, unknown> }>,
) {
  return {
    root: { props: {} },
    content: blocks.map((block, i) => ({
      type: block.type,
      props: { id: `block-${i}`, ...block.props },
    })),
    zones: {},
  };
}

// Posts
if (authorJane && tutorials && honoLogo && drizzleLogo) {
  await db.insert(posts).values(postData({
    title: 'Getting Started with Hono and Drizzle',
    slug: 'getting-started-hono-drizzle',
    excerpt:
      'Learn how to build a full-stack application using Hono for routing and Drizzle ORM for database access.',
    content:
      `Hono is a lightweight web framework that works everywhere - Deno, Node.js, Cloudflare Workers, and more. Combined with Drizzle ORM, you get a powerful stack for building modern web applications.

![Hono Framework](${getMediaUrl(honoLogo)})

In this tutorial, we'll walk through setting up a basic application with:

- Hono for HTTP routing and middleware
- Drizzle ORM for type-safe database queries
- PGlite for a zero-config PostgreSQL database

The beauty of this stack is its simplicity. Hono has zero dependencies, and Drizzle gives you full TypeScript support for your database operations.

![Drizzle ORM](${getMediaUrl(drizzleLogo)})

Let's start by creating a new project and installing our dependencies. With Deno, it's as simple as adding imports to your deno.json file.

Once you have your project set up, you can define your database schema using Drizzle's schema builder. This gives you type-safe queries and automatic migrations.

Stay tuned for more tutorials in this series!`,
    published: true,
    authorId: authorJane.id,
    categoryId: tutorials.id,
  })).onConflictDoNothing();
}

if (authorAlex && news) {
  await db.insert(posts).values(postData({
    title: 'Announcing hotsauce-cms 1.0',
    slug: 'announcing-hotsauce-cms-1-0',
    excerpt:
      'We are excited to announce the first stable release of hotsauce-cms, the headless CMS built on Drizzle ORM.',
    content:
      `After months of development and testing, we are thrilled to announce hotsauce-cms 1.0!

This release marks a major milestone in our journey to create the most developer-friendly headless CMS. Here's what's included:

Core Features:
- Automatic admin UI generation from your Drizzle schema
- Built-in authentication with JWT tokens
- Row-level security policies for fine-grained access control
- Plugin system for extending functionality

What makes hotsauce-cms unique is its zero-dependency philosophy. The entire CMS ships with just four production dependencies: drizzle-orm, postgres, zod, and drizzle-zod.

We've also focused heavily on runtime compatibility. The same code runs on Deno, Node.js, Bun, and even Cloudflare Workers.

Thank you to everyone who contributed to this release. We couldn't have done it without our amazing community!

Check out the documentation to get started, and let us know what you think.`,
    published: true,
    authorId: authorAlex.id,
    categoryId: news.id,
  })).onConflictDoNothing();
}

if (authorJane && opinion && denoLogo) {
  await db.insert(posts).values(postData({
    title: 'Why I Chose Deno for My Next Project',
    slug: 'why-i-chose-deno',
    excerpt:
      'A personal reflection on choosing Deno over Node.js for a new web application.',
    content:
      `When starting a new project, one of the first decisions is choosing your runtime. For my latest project, I chose Deno, and I couldn't be happier.

![Deno Runtime](${getMediaUrl(denoLogo)})

Here's why Deno stood out:

First-class TypeScript support: No more setting up ts-node or dealing with configuration files. Deno runs TypeScript out of the box.

Built-in tooling: Formatting, linting, testing, and bundling are all included. No need for a dozen devDependencies.

Security by default: Deno requires explicit permissions for file system, network, and environment access. This caught several potential issues in my code.

Web standard APIs: Using fetch(), Request, Response, and other web APIs means my code is portable across different environments.

URL imports and JSR: Import directly from URLs or use the new JavaScript Registry (JSR) for a modern package management experience.

Of course, Deno isn't perfect for every use case. The ecosystem is smaller than Node's, and some npm packages don't work without modification.

But for new projects, especially those targeting edge runtimes or prioritizing security, Deno is an excellent choice.

What's your experience with Deno? I'd love to hear your thoughts.`,
    published: true,
    authorId: authorJane.id,
    categoryId: opinion.id,
  })).onConflictDoNothing();
}

if (authorAlex && tutorials) {
  await db.insert(posts).values(postData({
    title: 'Building Type-Safe APIs with Drizzle ORM',
    slug: 'type-safe-apis-drizzle',
    excerpt:
      'How to leverage Drizzle ORM to build APIs where TypeScript catches errors before they reach production.',
    content:
      `Type safety isn't just nice to have - it's a fundamental tool for building reliable applications. Drizzle ORM takes this seriously, providing end-to-end type safety from your database schema to your API responses.

Let's explore how this works in practice.

Define Your Schema:
Start by defining your database schema using Drizzle's schema builder. Each table becomes a TypeScript type that flows through your entire application.

Query with Confidence:
When you write queries, TypeScript knows exactly what columns exist, what types they are, and what relations are available. Typos and type mismatches are caught at compile time.

Infer Types Automatically:
Drizzle provides type inference utilities that let you derive TypeScript types from your schema. No more maintaining separate interface definitions.

Relations Made Easy:
Define relations once in your schema, and Drizzle handles the joins. The returned data is fully typed, including nested relations.

The result is code that's not just safer, but also more productive to write. Your editor's autocomplete becomes incredibly powerful when it knows your entire database structure.

In the next tutorial, we'll build a complete REST API using these techniques.`,
    published: true,
    authorId: authorAlex.id,
    categoryId: tutorials.id,
  })).onConflictDoNothing();
}

// Draft post (not published)
if (authorJane && opinion) {
  await db.insert(posts).values(postData({
    title: 'The Future of Server-Side Rendering',
    slug: 'future-ssr',
    excerpt: 'Exploring where SSR is headed and what it means for developers.',
    content:
      `This is a draft post that explores upcoming trends in server-side rendering.

Topics to cover:
- Streaming SSR
- Partial hydration
- Islands architecture
- Edge rendering

More content coming soon...`,
    published: false,
    authorId: authorJane.id,
    categoryId: opinion.id,
  })).onConflictDoNothing();
}

// Pages (visual content with Puck editor)
await db.insert(pages).values({
  title: 'About',
  slug: 'about',
  content: puckContent([
    {
      type: 'Heading',
      props: {
        text: 'Welcome to The Hono Blog!',
        level: 'h1',
        align: 'center',
      },
    },
    {
      type: 'Text',
      props: {
        text:
          'This is a demo site showcasing how to build a complete blog with hotsauce-cms and Hono.',
        align: 'center',
        size: 'large',
      },
    },
    { type: 'Space', props: { size: 'large' } },
    {
      type: 'Heading',
      props: { text: 'What is this?', level: 'h2', align: 'left' },
    },
    {
      type: 'Text',
      props: {
        text:
          'This example demonstrates a "Backend for Frontend" (BFF) architecture where the public-facing blog is rendered server-side using Hono, the admin interface is powered by hotsauce-cms, and both share the same database and Drizzle schema.',
        align: 'left',
        size: 'medium',
      },
    },
    { type: 'Space', props: { size: 'medium' } },
    {
      type: 'Heading',
      props: { text: 'Technology Stack', level: 'h2', align: 'left' },
    },
    {
      type: 'Text',
      props: {
        text:
          'Hono - Lightweight web framework with zero dependencies. Drizzle ORM - Type-safe database toolkit. hotsauce-cms - Headless CMS with automatic admin UI. PGlite - In-process PostgreSQL for development.',
        align: 'left',
        size: 'medium',
      },
    },
    { type: 'Space', props: { size: 'medium' } },
    {
      type: 'Button',
      props: {
        label: 'View Source Code →',
        href: 'https://github.com/example/hotsauce-cms',
        variant: 'primary',
      },
    },
  ]),
  published: true,
  sortOrder: 1,
}).onConflictDoNothing();

await db.insert(pages).values({
  title: 'Contact',
  slug: 'contact',
  content: puckContent([
    {
      type: 'Heading',
      props: { text: 'Get in Touch', level: 'h1', align: 'center' },
    },
    {
      type: 'Text',
      props: {
        text: "We'd love to hear from you! Here's how you can reach us.",
        align: 'center',
        size: 'medium',
      },
    },
    { type: 'Space', props: { size: 'large' } },
    { type: 'Heading', props: { text: 'Email', level: 'h3', align: 'left' } },
    {
      type: 'Text',
      props: { text: 'hello@example.com', align: 'left', size: 'medium' },
    },
    { type: 'Space', props: { size: 'small' } },
    {
      type: 'Heading',
      props: { text: 'Contributing', level: 'h3', align: 'left' },
    },
    {
      type: 'Text',
      props: {
        text:
          'Interested in contributing to hotsauce-cms? We welcome bug reports, documentation improvements, code contributions, and sharing your projects.',
        align: 'left',
        size: 'medium',
      },
    },
    { type: 'Space', props: { size: 'medium' } },
    {
      type: 'Button',
      props: {
        label: 'View on GitHub',
        href: 'https://github.com/example/hotsauce-cms',
        variant: 'secondary',
      },
    },
  ]),
  published: true,
  sortOrder: 2,
}).onConflictDoNothing();

// ─────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────

console.log('');
console.log('✅ Database seeded successfully!');
console.log('');
console.log('📊 Created:');
console.log('   - 3 categories (Tutorials, News, Opinion)');
console.log('   - 2 authors (Jane Developer, Alex Writer)');
console.log('   - 3 media items (Hono, Drizzle, Deno logos)');
console.log('   - 4 published posts + 1 draft (some with media references)');
console.log('   - 2 pages (About, Contact)');
console.log('   - 3 site settings');
console.log('   - 1 admin user');
console.log('');
console.log('🔐 Admin credentials:');
console.log('   Email: admin@example.com');
console.log('   Password: admin123');
console.log('');
console.log('🚀 Run "deno task dev" to start the server');

// Close the connection
await client.close();
