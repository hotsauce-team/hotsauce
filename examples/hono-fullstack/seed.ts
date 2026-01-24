// Seed script for Hono frontend demo
// Creates tables and populates with sample data
// deno-lint-ignore-file no-console

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { hashPassword } from '@drizzle-cms/handlers';
import { parseMarkdown } from './admin/markdown.ts';

import {
  adminUsers,
  authors,
  categories,
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
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    content_html TEXT,
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
    value: 'A demo blog powered by drizzle-cms + Hono',
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
    contentHtml: parseMarkdown(data.content),
  };
}

/** Helper to create page data with pre-rendered HTML */
function pageData(data: {
  title: string;
  slug: string;
  content: string;
  published: boolean;
  sortOrder: number;
}) {
  return {
    ...data,
    contentHtml: parseMarkdown(data.content),
  };
}

// Posts
if (authorJane && tutorials) {
  await db.insert(posts).values(postData({
    title: 'Getting Started with Hono and Drizzle',
    slug: 'getting-started-hono-drizzle',
    excerpt:
      'Learn how to build a full-stack application using Hono for routing and Drizzle ORM for database access.',
    content:
      `Hono is a lightweight web framework that works everywhere - Deno, Node.js, Cloudflare Workers, and more. Combined with Drizzle ORM, you get a powerful stack for building modern web applications.

In this tutorial, we'll walk through setting up a basic application with:

- Hono for HTTP routing and middleware
- Drizzle ORM for type-safe database queries
- PGlite for a zero-config PostgreSQL database

The beauty of this stack is its simplicity. Hono has zero dependencies, and Drizzle gives you full TypeScript support for your database operations.

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
    title: 'Announcing drizzle-cms 1.0',
    slug: 'announcing-drizzle-cms-1-0',
    excerpt:
      'We are excited to announce the first stable release of drizzle-cms, the headless CMS built on Drizzle ORM.',
    content:
      `After months of development and testing, we are thrilled to announce drizzle-cms 1.0!

This release marks a major milestone in our journey to create the most developer-friendly headless CMS. Here's what's included:

Core Features:
- Automatic admin UI generation from your Drizzle schema
- Built-in authentication with JWT tokens
- Row-level security policies for fine-grained access control
- Plugin system for extending functionality

What makes drizzle-cms unique is its zero-dependency philosophy. The entire CMS ships with just four production dependencies: drizzle-orm, postgres, zod, and drizzle-zod.

We've also focused heavily on runtime compatibility. The same code runs on Deno, Node.js, Bun, and even Cloudflare Workers.

Thank you to everyone who contributed to this release. We couldn't have done it without our amazing community!

Check out the documentation to get started, and let us know what you think.`,
    published: true,
    authorId: authorAlex.id,
    categoryId: news.id,
  })).onConflictDoNothing();
}

if (authorJane && opinion) {
  await db.insert(posts).values(postData({
    title: 'Why I Chose Deno for My Next Project',
    slug: 'why-i-chose-deno',
    excerpt:
      'A personal reflection on choosing Deno over Node.js for a new web application.',
    content:
      `When starting a new project, one of the first decisions is choosing your runtime. For my latest project, I chose Deno, and I couldn't be happier.

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

// Pages
await db.insert(pages).values(pageData({
  title: 'About',
  slug: 'about',
  content: `Welcome to The Hono Blog!

This is a demo site showcasing how to build a complete blog with drizzle-cms and Hono.

What is this?

This example demonstrates a "Backend for Frontend" (BFF) architecture where:

- The public-facing blog is rendered server-side using Hono
- The admin interface is powered by drizzle-cms
- Both share the same database and Drizzle schema

Technology Stack:

- Hono - Lightweight web framework with zero dependencies
- Drizzle ORM - Type-safe database toolkit
- drizzle-cms - Headless CMS with automatic admin UI
- PGlite - In-process PostgreSQL for development

This architecture gives you complete control over your frontend while benefiting from the automatic admin interface that drizzle-cms provides.

Get Started:

Want to build something similar? Check out the source code in the examples/hono-frontend directory.`,
  published: true,
  sortOrder: 1,
})).onConflictDoNothing();

await db.insert(pages).values(pageData({
  title: 'Contact',
  slug: 'contact',
  content: `Get in Touch

We'd love to hear from you! Here's how you can reach us:

Email: hello@example.com

GitHub: Check out the project repository for issues and discussions.

Twitter: Follow us for updates and announcements.

Contributing:

Interested in contributing to drizzle-cms? We welcome contributions of all kinds:

- Bug reports and feature requests
- Documentation improvements
- Code contributions
- Sharing your projects built with drizzle-cms

Please read our contributing guidelines before submitting a pull request.`,
  published: true,
  sortOrder: 2,
})).onConflictDoNothing();

// ─────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────

console.log('');
console.log('✅ Database seeded successfully!');
console.log('');
console.log('📊 Created:');
console.log('   - 3 categories (Tutorials, News, Opinion)');
console.log('   - 2 authors (Jane Developer, Alex Writer)');
console.log('   - 4 published posts + 1 draft');
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
