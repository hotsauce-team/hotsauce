// Plugin Route Body Size Tests
// Verifies that plugin routes enforce a maximum request body size
// (Content-Length cap with a fallback check on the actual buffered body).

import { assertEquals, assertThrows } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  createBasicTables,
  schema,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import { generateCsrfToken } from '../csrf.ts';
import { PluginRegistry } from '../plugins/registry.ts';

Deno.test('plugin route: maxBodySize enforcement', async (t) => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await createBasicTables(db);

  // Plugin route POSTs require a valid CSRF token (sent via header).
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  const csrfHeaders = { 'X-CSRF-Token': csrfToken };

  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    db,
    schema,
    basePath: '/admin',
    plugins: [
      {
        name: 'body-test',
        filter: 'dangerously-open' as const,
        routes: [
          {
            pattern: 'default-cap',
            methods: ['POST'],
            handler: () => 'OK',
          },
          {
            pattern: 'small-cap',
            methods: ['POST'],
            maxBodySize: 10,
            handler: () => 'OK',
          },
        ],
      },
    ],
  });

  await t.step('body under the cap passes through', async () => {
    const res = await handler(
      new Request('http://localhost/admin/body-test/small-cap', {
        method: 'POST',
        headers: csrfHeaders,
        body: 'hi', // 2 bytes, under the 10-byte cap
      }),
    );
    assertEquals(res.status, 200);
  });

  await t.step(
    'Content-Length over the per-route cap returns 413',
    async () => {
      const res = await handler(
        new Request('http://localhost/admin/body-test/small-cap', {
          method: 'POST',
          headers: csrfHeaders,
          body: 'this body is definitely larger than ten bytes',
        }),
      );
      assertEquals(res.status, 413);
    },
  );

  await t.step('body over the default 200KB cap returns 413', async () => {
    const res = await handler(
      new Request('http://localhost/admin/body-test/default-cap', {
        method: 'POST',
        headers: csrfHeaders,
        body: 'x'.repeat(204_800 + 1),
      }),
    );
    assertEquals(res.status, 413);
  });

  await t.step('body at the default 200KB cap passes through', async () => {
    const res = await handler(
      new Request('http://localhost/admin/body-test/default-cap', {
        method: 'POST',
        headers: csrfHeaders,
        body: 'x'.repeat(204_800),
      }),
    );
    assertEquals(res.status, 200);
  });

  await t.step(
    'chunked body without Content-Length is still capped',
    async () => {
      // A streamed body has no Content-Length header, so the header check is
      // bypassed. The fallback check on the buffered body must still reject it.
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(100)));
          controller.close();
        },
      });
      const req = new Request('http://localhost/admin/body-test/small-cap', {
        method: 'POST',
        headers: csrfHeaders,
        body: stream,
        // @ts-ignore: duplex is required for streaming request bodies
        duplex: 'half',
      });
      assertEquals(req.headers.get('content-length'), null);
      const res = await handler(req);
      assertEquals(res.status, 413);
    },
  );
});

Deno.test('plugin route validation: maxBodySize must be a positive integer', () => {
  const registry = new PluginRegistry();

  assertThrows(
    () =>
      registry.register({
        name: 'bad-in-process',
        filter: 'dangerously-open',
        routes: [
          {
            pattern: 'x',
            methods: ['POST'],
            maxBodySize: -1,
            handler: () => 'OK',
          },
        ],
      }),
    Error,
    'maxBodySize',
  );

  assertThrows(
    () =>
      registry.register({
        name: 'bad-in-process-nan',
        filter: 'dangerously-open',
        routes: [
          {
            pattern: 'x',
            methods: ['POST'],
            maxBodySize: Number.NaN,
            handler: () => 'OK',
          },
        ],
      }),
    Error,
    'maxBodySize',
  );

  assertThrows(
    () =>
      registry.register({
        name: 'bad-in-process-float',
        filter: 'dangerously-open',
        routes: [
          {
            pattern: 'x',
            methods: ['POST'],
            maxBodySize: 0.5,
            handler: () => 'OK',
          },
        ],
      }),
    Error,
    'maxBodySize',
  );
});
