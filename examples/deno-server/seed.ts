// deno-lint-ignore-file no-console
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { categories, postCategories, posts, users } from './schema.ts';
import { hashPassword } from '../../packages/handlers/mod.ts';

// Database connection (persisted to ./data)
const client = new PGlite('./data');
const db = drizzle(client);

console.log('🌱 Seeding database...');

// Clear existing data - drop tables in reverse dependency order
console.log('🧹 Clearing existing data...');
await client.exec(`
  DROP TABLE IF EXISTS post_categories CASCADE;
  DROP TABLE IF EXISTS posts CASCADE;
  DROP TABLE IF EXISTS categories CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
`);

// Create tables (simple DDL)
await client.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    role VARCHAR(50),
    avatar JSONB,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    content TEXT,
    published BOOLEAN DEFAULT FALSE,
    author_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS post_categories (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, category_id)
  );
`);

// Seed users (admin user has passwordHash for CMS login)
const adminPasswordHash = await hashPassword('admin123');
await db.insert(users).values([
  {
    name: 'Admin User',
    email: 'admin@example.com',
    passwordHash: adminPasswordHash,
    role: 'admin',
    avatar: {
      filename: 'admin.png',
      contentType: 'image/png',
      size: 12345,
      url: '/uploads/avatars/admin.png',
    },
    bio: 'Site administrator',
  },
  {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    role: 'editor',
    avatar: {
      filename: 'alice.jpg',
      contentType: 'image/jpeg',
      size: 23456,
      url: '/uploads/avatars/alice.jpg',
    },
    bio: 'Writer and editor',
  },
  {
    name: 'Bob Smith',
    email: 'bob@example.com',
    avatar: {
      filename: 'bob.svg',
      contentType: 'image/svg+xml',
      size: 3456,
      url: '/uploads/avatars/bob.svg',
    },
    bio: 'Developer',
  },
  {
    name: 'Carol White',
    email: 'carol@example.com',
    avatar: {
      // Inline base64 image (1x1 purple pixel PNG) - served from /admin/files/users/avatar/{id}
      filename: 'carol-avatar.png',
      contentType: 'image/png',
      size: 70,
      data:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==',
    },
  },
]).onConflictDoNothing();
console.log('👤 Admin user created: admin@example.com / admin123');

// Seed categories
await db.insert(categories).values([
  {
    name: 'Technology',
    slug: 'technology',
    description: 'Tech news and tutorials',
  },
  { name: 'Design', slug: 'design', description: 'UI/UX and graphic design' },
  {
    name: 'Business',
    slug: 'business',
    description: 'Business and entrepreneurship',
  },
]).onConflictDoNothing();

// Seed posts
await db.insert(posts).values([
  {
    title: 'Getting Started with Drizzle',
    slug: 'getting-started-drizzle',
    content: 'Drizzle ORM is a TypeScript ORM...',
    published: true,
    authorId: 1,
  },
  {
    title: 'Building a CMS',
    slug: 'building-cms',
    content: 'In this tutorial we build a CMS....',
    published: false,
    authorId: 1,
  },
  {
    title: 'Web Standards FTW',
    slug: 'web-standards',
    content: 'Why web standards matter...',
    published: true,
    authorId: 2,
  },
]).onConflictDoNothing();

// Seed post-category relationships
await db.insert(postCategories).values([
  { postId: 1, categoryId: 1 }, // Drizzle post -> Technology
  { postId: 2, categoryId: 1 }, // CMS post -> Technology
  { postId: 2, categoryId: 2 }, // CMS post -> Design
  { postId: 3, categoryId: 1 }, // Web Standards -> Technology
  { postId: 3, categoryId: 3 }, // Web Standards -> Business
]).onConflictDoNothing();

console.log('✅ Database seeded!');

await client.close();
