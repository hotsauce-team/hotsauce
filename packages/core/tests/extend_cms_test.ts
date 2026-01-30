import { assertEquals, assertExists } from '@std/assert';

// Importing this module patches Drizzle's column builder prototypes.
import '../extend/mod.ts';
import { introspectTable } from '../schema/introspect.ts';

// ─────────────────────────────────────────────────────────────
// Column-level $cms() tests
// ─────────────────────────────────────────────────────────────

Deno.test('$cms(): attaches cmsOptions to pg column builder and built column', async () => {
  const { pgTable, jsonb } = await import('drizzle-orm/pg-core');

  const users = pgTable('users', {
    avatar: jsonb('avatar').$cms({ file: true }).notNull(),
  });

  const meta = introspectTable(users);
  const avatar = meta.columns.find((c) => c.propertyName === 'avatar');
  assertExists(avatar);
  assertEquals(avatar.cmsOptions, { file: true });
});

Deno.test('$cms(): attaches cmsOptions to sqlite column builder and built column', async () => {
  const { sqliteTable, text } = await import('drizzle-orm/sqlite-core');

  const files = sqliteTable('files', {
    fileRef: text('file_ref').$cms({ file: true }),
  });

  const meta = introspectTable(files);
  const fileRef = meta.columns.find((c) => c.propertyName === 'fileRef');
  assertExists(fileRef);
  assertEquals(fileRef.cmsOptions, { file: true });
});

Deno.test('$cms(): attaches cmsOptions to mysql column builder and built column', async () => {
  const { mysqlTable, json } = await import('drizzle-orm/mysql-core');

  const users = mysqlTable('users', {
    avatar: json('avatar').$cms({ file: true }),
  });

  const meta = introspectTable(users);
  const avatar = meta.columns.find((c) => c.propertyName === 'avatar');
  assertExists(avatar);
  assertEquals(avatar.cmsOptions, { file: true });
});

Deno.test('$cms(): calling twice merges options (shallow merge)', async () => {
  const { pgTable, jsonb } = await import('drizzle-orm/pg-core');

  // Use type assertion to test arbitrary options merge behavior
  const users = pgTable('users', {
    avatar: jsonb('avatar')
      .$cms({ file: true } as Record<string, unknown>)
      .$cms({ customFlag: 'test' } as Record<string, unknown>),
  });

  const meta = introspectTable(users);
  const avatar = meta.columns.find((c) => c.propertyName === 'avatar');
  assertExists(avatar);
  // deno-lint-ignore no-explicit-any
  assertEquals(avatar.cmsOptions as any, {
    file: true,
    customFlag: 'test',
  });
});

Deno.test('$cms(): chaining .notNull().default() does not drop metadata', async () => {
  const { pgTable, jsonb } = await import('drizzle-orm/pg-core');

  const files = pgTable('files', {
    metadata: jsonb('metadata')
      .$cms({ file: true })
      .notNull()
      .default({}),
  });

  const meta = introspectTable(files);
  const metadata = meta.columns.find((c) => c.propertyName === 'metadata');
  assertExists(metadata);
  assertEquals(metadata.cmsOptions, { file: true });
  assertEquals(metadata.notNull, true);
  assertEquals(metadata.hasDefault, true);
});

// ─────────────────────────────────────────────────────────────
// Table-level $cms() tests
// ─────────────────────────────────────────────────────────────

Deno.test('table $cms(): attaches cmsOptions to pg table', async () => {
  const { pgTable, serial, varchar } = await import('drizzle-orm/pg-core');

  const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
  }).$cms({
    frontendUrl: (post) => `/blog/${post.slug}`,
    label: 'Blog Post',
  });

  const meta = introspectTable(posts);
  assertExists(meta.cmsOptions);
  assertEquals(meta.cmsOptions.label, 'Blog Post');
  assertEquals(typeof meta.cmsOptions.frontendUrl, 'function');

  // Test the function works
  const url = meta.cmsOptions.frontendUrl!({ slug: 'hello-world' });
  assertEquals(url, '/blog/hello-world');
});

Deno.test('table $cms(): attaches cmsOptions to sqlite table', async () => {
  const { sqliteTable, integer, text } = await import(
    'drizzle-orm/sqlite-core'
  );

  const pages = sqliteTable('pages', {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
  }).$cms({
    frontendUrl: (page) => `/${page.slug}`,
    hidden: true,
  });

  const meta = introspectTable(pages);
  assertExists(meta.cmsOptions);
  assertEquals(meta.cmsOptions.hidden, true);

  const url = meta.cmsOptions.frontendUrl!({ slug: 'about' });
  assertEquals(url, '/about');
});

Deno.test('table $cms(): attaches cmsOptions to mysql table', async () => {
  const { mysqlTable, serial, varchar } = await import(
    'drizzle-orm/mysql-core'
  );

  const categories = mysqlTable('categories', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull(),
  }).$cms({
    frontendUrl: (cat) => `/category/${cat.slug}`,
    labelPlural: 'Categories',
  });

  const meta = introspectTable(categories);
  assertExists(meta.cmsOptions);
  assertEquals(meta.cmsOptions.labelPlural, 'Categories');

  const url = meta.cmsOptions.frontendUrl!({ slug: 'tech' });
  assertEquals(url, '/category/tech');
});

Deno.test('table $cms(): frontendUrl can return null to hide link', async () => {
  const { pgTable, serial, boolean, varchar } = await import(
    'drizzle-orm/pg-core'
  );

  const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    published: boolean('published').default(false).notNull(),
  }).$cms({
    frontendUrl: (post) => (post.published ? `/blog/${post.slug}` : null),
  });

  const meta = introspectTable(posts);
  assertExists(meta.cmsOptions?.frontendUrl);

  // Published post gets a URL
  const publishedUrl = meta.cmsOptions.frontendUrl({
    slug: 'test',
    published: true,
  });
  assertEquals(publishedUrl, '/blog/test');

  // Draft post returns null
  const draftUrl = meta.cmsOptions.frontendUrl({
    slug: 'test',
    published: false,
  });
  assertEquals(draftUrl, null);
});

Deno.test('table $cms(): table without $cms() has no cmsOptions', async () => {
  const { pgTable, serial, text } = await import('drizzle-orm/pg-core');

  const settings = pgTable('settings', {
    id: serial('id').primaryKey(),
    key: text('key').notNull(),
    value: text('value').notNull(),
  });

  const meta = introspectTable(settings);
  assertEquals(meta.cmsOptions, undefined);
});

Deno.test('table $cms(): works alongside column $cms()', async () => {
  const { pgTable, serial, jsonb, varchar } = await import(
    'drizzle-orm/pg-core'
  );

  const media = pgTable('media', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull(),
    file: jsonb('file').$cms({ file: true }),
  }).$cms({
    frontendUrl: (m) => `/media/${m.slug}`,
    label: 'Media File',
  });

  const meta = introspectTable(media);

  // Table-level options
  assertExists(meta.cmsOptions);
  assertEquals(meta.cmsOptions.label, 'Media File');

  // Column-level options
  const fileCol = meta.columns.find((c) => c.propertyName === 'file');
  assertExists(fileCol);
  assertEquals(fileCol.cmsOptions, { file: true });
});
