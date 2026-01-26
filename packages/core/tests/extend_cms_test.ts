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
