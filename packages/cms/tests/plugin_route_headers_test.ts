// Plugin Route Security Headers Tests
// Verifies that security headers are correctly applied to plugin route responses

import { assertEquals } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  createBasicTables,
  schema,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';

Deno.test('plugin route: security headers', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await createBasicTables(db);

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema,
    basePath: '/admin',
    plugins: [
      {
        name: 'header-test',
        filter: 'dangerously-open' as const,
        routes: [
          {
            pattern: 'string-html',
            handler: () => '<h1>Hello</h1>',
          },
          {
            pattern: 'response-html',
            handler: () =>
              new Response('<h1>Hello</h1>', {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              }),
          },
          {
            pattern: 'response-html-custom-csp',
            handler: () =>
              new Response('<h1>Hello</h1>', {
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Content-Security-Policy':
                    "default-src 'self'; connect-src 'self' https://s3.example.com",
                },
              }),
          },
          {
            pattern: 'response-json',
            handler: () =>
              new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json' },
              }),
          },
        ],
      },
    ],
  });

  await t.step('string return gets full security headers', async () => {
    const res = await handler(
      new Request('http://localhost/admin/header-test/string-html'),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('X-Frame-Options'), 'DENY');
    assertEquals(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assertEquals(
      res.headers.get('Referrer-Policy'),
      'strict-origin-when-cross-origin',
    );
    assertEquals(res.headers.has('Content-Security-Policy'), true);
  });

  await t.step(
    'HTML Response gets CMS security headers filled in',
    async () => {
      const res = await handler(
        new Request('http://localhost/admin/header-test/response-html'),
      );
      assertEquals(res.status, 200);
      assertEquals(res.headers.get('X-Frame-Options'), 'DENY');
      assertEquals(res.headers.get('X-Content-Type-Options'), 'nosniff');
      assertEquals(
        res.headers.get('Referrer-Policy'),
        'strict-origin-when-cross-origin',
      );
      assertEquals(res.headers.has('Content-Security-Policy'), true);
    },
  );

  await t.step(
    'HTML Response with custom headers gets CMS CSP enforced',
    async () => {
      const res = await handler(
        new Request(
          'http://localhost/admin/header-test/response-html-custom-csp',
        ),
      );
      assertEquals(res.status, 200);
      // CMS CSP enforced — plugins cannot override security headers
      const csp = res.headers.get('Content-Security-Policy');
      assertEquals(csp?.includes("frame-ancestors 'none'"), true);
      assertEquals(csp?.includes('https://s3.example.com'), false);
      // All security headers enforced by CMS
      assertEquals(res.headers.get('X-Frame-Options'), 'DENY');
      assertEquals(res.headers.get('X-Content-Type-Options'), 'nosniff');
      assertEquals(
        res.headers.get('Referrer-Policy'),
        'strict-origin-when-cross-origin',
      );
    },
  );

  await t.step(
    'non-HTML Response gets only nosniff header',
    async () => {
      const res = await handler(
        new Request('http://localhost/admin/header-test/response-json'),
      );
      assertEquals(res.status, 200);
      assertEquals(res.headers.get('X-Content-Type-Options'), 'nosniff');
      assertEquals(res.headers.get('X-Frame-Options'), null);
      assertEquals(res.headers.get('Referrer-Policy'), null);
      assertEquals(res.headers.get('Content-Security-Policy'), null);
    },
  );
});
