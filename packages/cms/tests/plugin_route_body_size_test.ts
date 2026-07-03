// Plugin Route Body Size Tests
// Verifies that plugin routes enforce a maximum request body size: an early
// Content-Length reject, plus a streaming byte cap that aborts mid-transfer
// for chunked bodies (no Content-Length) so they are never fully buffered.

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
          {
            pattern: 'stream-cap',
            methods: ['POST'],
            maxBodySize: 10,
            bodyType: 'stream',
            handler: async (ctx) => {
              // The body must arrive as a raw byte stream, never decoded text.
              if (ctx.body !== undefined) {
                return new Response('body should be undefined', {
                  status: 500,
                });
              }
              if (!ctx.bodyStream) {
                return new Response('missing bodyStream', { status: 500 });
              }
              // Draining the capped stream throws if the cap is exceeded;
              // a consumer maps that to a client error (here, 413).
              try {
                let total = 0;
                for await (const chunk of ctx.bodyStream) total += chunk.length;
                return new Response(String(total));
              } catch {
                return new Response('too large', { status: 413 });
              }
            },
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
    'Content-Length over the per-route cap returns 413 (header fast-path)',
    async () => {
      // The body is tiny, but an oversized Content-Length must be rejected on
      // the header alone — before the body is read. A 413 here can only come
      // from the fast-path, since streaming a 2-byte body would never exceed
      // the 10-byte cap.
      const res = await handler(
        new Request('http://localhost/admin/body-test/small-cap', {
          method: 'POST',
          headers: { ...csrfHeaders, 'content-length': '5000' },
          body: 'hi',
        }),
      );
      assertEquals(res.status, 413);
    },
  );

  await t.step(
    'body over the default 200KB cap returns 413 (streaming path)',
    async () => {
      // No explicit Content-Length, so this exercises the streaming cap: the
      // body is tallied as it is read and aborted once it crosses the default.
      const res = await handler(
        new Request('http://localhost/admin/body-test/default-cap', {
          method: 'POST',
          headers: csrfHeaders,
          body: 'x'.repeat(204_800 + 1),
        }),
      );
      assertEquals(res.status, 413);
    },
  );

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
      // bypassed. The streaming cap must still abort and reject it.
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

  await t.step(
    'stream route: body arrives as a raw byte stream (body undefined)',
    async () => {
      const res = await handler(
        new Request('http://localhost/admin/body-test/stream-cap', {
          method: 'POST',
          headers: csrfHeaders,
          body: 'hello', // 5 bytes, under the 10-byte cap
        }),
      );
      assertEquals(res.status, 200);
      assertEquals(await res.text(), '5'); // byte count drained from the stream
    },
  );

  await t.step(
    'stream route: Content-Length over the cap returns 413 (header fast-path)',
    async () => {
      const res = await handler(
        new Request('http://localhost/admin/body-test/stream-cap', {
          method: 'POST',
          headers: { ...csrfHeaders, 'content-length': '5000' },
          body: 'hi',
        }),
      );
      assertEquals(res.status, 413);
    },
  );

  await t.step(
    'stream route: chunked body over the cap aborts mid-stream',
    async () => {
      // No Content-Length, so the streaming cap must error the stream as the
      // handler drains it once the running total crosses the 10-byte cap.
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(100)));
          controller.close();
        },
      });
      const req = new Request('http://localhost/admin/body-test/stream-cap', {
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

  await t.step(
    'oversized body without CSRF header is capped before the formData fallback',
    async () => {
      // No X-CSRF-Token header → the dispatch falls back to reading the token
      // from the form body. The size gate must reject an oversized body with
      // 413 before formData() buffers it (rather than parsing then 403-ing).
      const res = await handler(
        new Request('http://localhost/admin/body-test/small-cap', {
          method: 'POST',
          body: 'this body is well over the ten byte cap',
        }),
      );
      assertEquals(res.status, 413);
    },
  );

  await t.step(
    'CSRF token in the form body (no header) still passes under the cap',
    async () => {
      // The body-token fallback is preserved: a request under the cap with the
      // token in the form body authenticates and succeeds.
      const form = new URLSearchParams({ __cms_csrf: csrfToken });
      const res = await handler(
        new Request('http://localhost/admin/body-test/default-cap', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }),
      );
      assertEquals(res.status, 200);
    },
  );

  await t.step(
    'no CSRF token in header or body (under the cap) is rejected',
    async () => {
      // The fallback must reject, not silently allow, when the body genuinely
      // carries no token. The body is under the cap, so the size gate passes
      // and the request reaches CSRF validation, which fails with 403.
      const form = new URLSearchParams({ notACsrfField: 'value' });
      const res = await handler(
        new Request('http://localhost/admin/body-test/default-cap', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        }),
      );
      assertEquals(res.status, 403);
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
