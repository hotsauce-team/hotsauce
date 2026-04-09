// Test for primaryKey property name vs DB column name
// Drizzle returns records with property names (camelCase) as keys,
// not database column names (snake_case). The list view must use
// propertyName to look up the primary key value in records.

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createCmsHandler } from '../mod.ts';

// Import extend module for side effects
import '@hotsauce/core/extend';

const TEST_CSRF_SECRET = 'test-csrf-secret-for-integration-tests-min-32-chars';

// Schema with snake_case PRIMARY KEY column name
// Property name: itemId (camelCase)
// DB column name: item_id (snake_case)
const items = pgTable('items', {
  itemId: serial('item_id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
});

const schemaWithSnakeCasePK = { items };

Deno.test('drizzle returns records with propertyName keys, not column names', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithSnakeCasePK });

  await db.execute(sql`
    CREATE TABLE items (
      item_id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    )
  `);

  await db.insert(items).values({ name: 'Test Item' });

  // Query the record back
  const records = await db.select().from(items);
  const record = records[0]!;

  // Drizzle uses propertyName (itemId), not column name (item_id)
  assertEquals(Object.keys(record).sort(), ['itemId', 'name']);
  assertEquals(record.itemId, 1);
  assertEquals((record as Record<string, unknown>)['item_id'], undefined);

  await client.close();
});

Deno.test('list view uses propertyName for primaryKey lookup', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithSnakeCasePK });

  await db.execute(sql`
    CREATE TABLE items (
      item_id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    )
  `);

  await db.insert(items).values({ name: 'Test Item' });

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema: schemaWithSnakeCasePK,
    basePath: '/admin',
  });

  const response = await handler(
    new Request('http://localhost/admin/items'),
  );

  const html = await response.text();

  // Action links should contain the actual record ID
  assertStringIncludes(
    html,
    '/admin/items/1',
    'Action links should contain the actual record ID, not undefined',
  );

  // Ensure "undefined" doesn't appear in action URLs
  if (html.includes('/admin/items/undefined')) {
    throw new Error(
      'List view is using DB column name instead of property name for primaryKey lookup',
    );
  }

  await client.close();
});
