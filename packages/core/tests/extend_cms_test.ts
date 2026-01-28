import { assertEquals, assertExists } from '@std/assert';

// Importing this module patches Drizzle's column builder prototypes.
import '../extend/mod.ts';
import { introspectTable } from '../schema/introspect.ts';

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
