/// <reference path="../../core/extend/drizzle.d.ts" />

// Integration tests for frontendUrl ($cms table option)

import { assertEquals } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { boolean, pgTable, serial, varchar } from 'drizzle-orm/pg-core';

import '@hotsauce/core/extend';

import { createCmsHandler } from '../mod.ts';
import type { Handler } from '../types.ts';

const TEST_CSRF_SECRET =
  'test-csrf-secret-for-frontend-url-security-min-32-chars';

async function createTestHandler(
  frontendUrl: (record: Record<string, unknown>) => string | null | undefined,
): Promise<{ handler: Handler; getOnErrorCalls: () => number }> {
  const pages = pgTable('pages', {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    published: boolean('published').default(false).notNull(),
  }).$cms({
    frontendUrl,
  });

  const schema = { pages };

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await db.execute(sql`
    CREATE TABLE pages (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(255) NOT NULL,
      published BOOLEAN NOT NULL DEFAULT false
    )
  `);

  await db.insert(pages).values({ slug: 'hello', published: true });

  let onErrorCalls = 0;
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema,
    basePath: '/admin',
    onError: () => {
      onErrorCalls++;
    },
  });

  return { handler, getOnErrorCalls: () => onErrorCalls };
}

Deno.test('integration: frontendUrl allows relative and http(s) URLs', async (t) => {
  await t.step('happy path: relative URL renders on read + edit', async () => {
    const { handler, getOnErrorCalls } = await createTestHandler((record) => {
      const slug = String(record.slug ?? '');
      return `/blog/${slug}`;
    });

    const readRes = await handler(
      new Request('http://localhost/admin/pages/1'),
    );
    assertEquals(readRes.status, 200);
    const readHtml = await readRes.text();
    assertEquals(readHtml.includes('View on site'), true);
    assertEquals(readHtml.includes('href="/blog/hello"'), true);

    const editRes = await handler(
      new Request('http://localhost/admin/pages/1/edit'),
    );
    assertEquals(editRes.status, 200);
    const editHtml = await editRes.text();
    assertEquals(editHtml.includes('View on site'), true);
    assertEquals(editHtml.includes('href="/blog/hello"'), true);

    assertEquals(getOnErrorCalls(), 0);
  });

  await t.step(
    'happy path: absolute https URL renders on read + edit',
    async () => {
      const { handler, getOnErrorCalls } = await createTestHandler((record) => {
        const slug = String(record.slug ?? '');
        return `https://example.com/blog/${slug}`;
      });

      const readRes = await handler(
        new Request('http://localhost/admin/pages/1'),
      );
      assertEquals(readRes.status, 200);
      const readHtml = await readRes.text();
      assertEquals(readHtml.includes('View on site'), true);
      assertEquals(
        readHtml.includes('href="https://example.com/blog/hello"'),
        true,
      );

      const editRes = await handler(
        new Request('http://localhost/admin/pages/1/edit'),
      );
      assertEquals(editRes.status, 200);
      const editHtml = await editRes.text();
      assertEquals(editHtml.includes('View on site'), true);
      assertEquals(
        editHtml.includes('href="https://example.com/blog/hello"'),
        true,
      );

      assertEquals(getOnErrorCalls(), 0);
    },
  );
});

Deno.test('integration: frontendUrl blocks dangerous URL forms', async (t) => {
  await t.step('blocks javascript: URLs (click-to-XSS)', async () => {
    const { handler, getOnErrorCalls } = await createTestHandler(() =>
      'javascript:alert(1)'
    );

    const readRes = await handler(
      new Request('http://localhost/admin/pages/1'),
    );
    assertEquals(readRes.status, 200);
    const readHtml = await readRes.text();
    assertEquals(readHtml.includes('View on site'), false);
    assertEquals(getOnErrorCalls() > 0, true);

    const editRes = await handler(
      new Request('http://localhost/admin/pages/1/edit'),
    );
    assertEquals(editRes.status, 200);
    const editHtml = await editRes.text();
    assertEquals(editHtml.includes('View on site'), false);
  });

  await t.step('blocks protocol-relative URLs (//evil.com)', async () => {
    const { handler, getOnErrorCalls } = await createTestHandler(() =>
      '//evil.example/x'
    );

    const readRes = await handler(
      new Request('http://localhost/admin/pages/1'),
    );
    assertEquals(readRes.status, 200);
    const readHtml = await readRes.text();
    assertEquals(readHtml.includes('View on site'), false);
    assertEquals(getOnErrorCalls() > 0, true);
  });
});
