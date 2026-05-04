// Tests for the resolveFlashes UI plugin hook and flashes array rendering.

import { assertEquals, assertStringIncludes } from '@std/assert';
import { createCmsHandler } from '../mod.ts';
import type { IntrospectedSchema, IntrospectedTable } from '@hotsauce/core';
import type { FlashMessage, ResolveFlashesContext } from '../plugins/types.ts';

const TEST_CSRF_SECRET = 'test-csrf-secret-resolve-flashes-min-32-chars-x';

const mockTable: IntrospectedTable = {
  name: 'posts',
  columns: [
    {
      name: 'id',
      propertyName: 'id',
      columnType: 'PgSerial',
      dataType: 'number',
      notNull: true,
      hasDefault: true,
      isPrimaryKey: true,
      isUnique: false,
    },
    {
      name: 'title',
      propertyName: 'title',
      columnType: 'PgVarchar',
      dataType: 'string',
      notNull: true,
      hasDefault: false,
      isPrimaryKey: false,
      isUnique: false,
    },
  ],
  primaryKey: ['id'],
  table: {},
};

const mockSchema: IntrospectedSchema = {
  tables: [mockTable],
  relations: [],
  junctions: [],
};

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([]) }),
      limit: () => ({ offset: () => Promise.resolve([]) }),
    }),
  }),
  insert: () => ({
    values: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }),
  }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  delete: () => ({ where: () => Promise.resolve() }),
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildHandler(
  resolveFlashes?: (
    ctx: ResolveFlashesContext,
  ) => FlashMessage[] | Promise<FlashMessage[]>,
) {
  return createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    schema: mockSchema,
    db: mockDb,
    plugins: resolveFlashes
      ? [
        {
          name: 'flash-test',
          hooks: { ui: { resolveFlashes } },
          filter: 'dangerously-open',
        },
      ]
      : undefined,
  });
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

Deno.test('resolveFlashes: plugin can inject a flash when none is set', async () => {
  const handler = buildHandler(() => [
    { type: 'info', message: 'Demo mode banner' },
  ]);

  const res = await handler(new Request('http://localhost/admin'));
  const body = await res.text();

  assertEquals(res.status, 200);
  assertStringIncludes(body, 'Demo mode banner');
  assertStringIncludes(body, 'cms-alert-info');
});

Deno.test('resolveFlashes: plugin sees URL-derived flash and can append', async () => {
  let observed: FlashMessage[] = [];
  const handler = buildHandler((ctx) => {
    observed = ctx.flashes;
    return [...ctx.flashes, { type: 'warning', message: 'Plugin warning' }];
  });

  const res = await handler(
    new Request('http://localhost/admin/posts?_flash=create_success'),
  );
  const body = await res.text();

  assertEquals(observed.length, 1);
  assertEquals(observed[0]!.type, 'success');
  assertStringIncludes(body, 'Plugin warning');
  assertStringIncludes(body, 'cms-alert-warning');
  // Original flash from URL also still rendered
  assertStringIncludes(body, 'cms-alert-success');
});

Deno.test('resolveFlashes: plugin can suppress all flashes', async () => {
  const handler = buildHandler(() => []);

  const res = await handler(
    new Request('http://localhost/admin/posts?_flash=create_success'),
  );
  const body = await res.text();

  // No alert div anywhere
  assertEquals(body.includes('cms-alert-success'), false);
  assertEquals(body.includes('cms-alert'), false);
});

Deno.test('resolveFlashes: receives action and table context', async () => {
  let observedAction: string | undefined;
  let observedTable: string | undefined;
  const handler = buildHandler((ctx) => {
    observedAction = ctx.action;
    observedTable = ctx.table;
    return ctx.flashes;
  });

  await handler(new Request('http://localhost/admin'));
  assertEquals(observedAction, 'dashboard');
  assertEquals(observedTable, undefined);

  await handler(new Request('http://localhost/admin/posts'));
  assertEquals(observedAction, 'list');
  assertEquals(observedTable, 'posts');
});

Deno.test('resolveFlashes: layout renders multiple flashes in order', async () => {
  const handler = buildHandler(() => [
    { type: 'info', message: 'First message' },
    { type: 'warning', message: 'Second message' },
    { type: 'error', message: 'Third message' },
  ]);

  const res = await handler(new Request('http://localhost/admin'));
  const body = await res.text();

  // Verify all three appear
  assertStringIncludes(body, 'First message');
  assertStringIncludes(body, 'Second message');
  assertStringIncludes(body, 'Third message');

  // Verify ordering
  const i1 = body.indexOf('First message');
  const i2 = body.indexOf('Second message');
  const i3 = body.indexOf('Third message');
  assertEquals(i1 < i2 && i2 < i3, true);
});

Deno.test('resolveFlashes: plugin error is caught and previous flashes preserved', async () => {
  const errors: Error[] = [];
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    schema: mockSchema,
    db: mockDb,
    onError: (err) => errors.push(err),
    plugins: [
      {
        name: 'flash-bad',
        hooks: {
          ui: {
            resolveFlashes: () => {
              throw new Error('boom');
            },
          },
        },
        filter: 'dangerously-open',
      },
    ],
  });

  const res = await handler(
    new Request('http://localhost/admin/posts?_flash=create_success'),
  );
  const body = await res.text();

  assertEquals(res.status, 200);
  // URL-derived flash still rendered (fallback to previous flashes on error)
  assertStringIncludes(body, 'cms-alert-success');
  // Error was reported to onError
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message, 'boom');
});

Deno.test('resolveFlashes: chains multiple plugins in order', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    auth: 'dangerously-open',
    policies: 'dangerously-open',
    schema: mockSchema,
    db: mockDb,
    plugins: [
      {
        name: 'plugin-a',
        hooks: {
          ui: {
            resolveFlashes: (ctx) => [
              ...ctx.flashes,
              { type: 'info', message: 'from-a' },
            ],
          },
        },
        filter: 'dangerously-open',
      },
      {
        name: 'plugin-b',
        hooks: {
          ui: {
            resolveFlashes: (ctx) => [
              ...ctx.flashes,
              { type: 'info', message: 'from-b' },
            ],
          },
        },
        filter: 'dangerously-open',
      },
    ],
  });

  const res = await handler(new Request('http://localhost/admin'));
  const body = await res.text();

  assertStringIncludes(body, 'from-a');
  assertStringIncludes(body, 'from-b');
  assertEquals(body.indexOf('from-a') < body.indexOf('from-b'), true);
});

Deno.test('resolveFlashes: no plugin = URL flash still renders via layout', async () => {
  const handler = buildHandler(); // no plugin

  const res = await handler(
    new Request('http://localhost/admin/posts?_flash=create_success'),
  );
  const body = await res.text();

  assertStringIncludes(body, 'cms-alert-success');
});

Deno.test('resolveFlashes: plugin-supplied HTML in message is escaped', async () => {
  const payload = `<script>alert("xss")</script><img src=x onerror="alert(1)">`;
  const handler = buildHandler(() => [
    { type: 'error', message: payload },
  ]);

  const res = await handler(new Request('http://localhost/admin'));
  const body = await res.text();

  // Raw payload must NOT appear unescaped anywhere in the body
  assertEquals(body.includes(payload), false);
  assertEquals(body.includes('<script>alert("xss")</script>'), false);
  assertEquals(body.includes('onerror="alert(1)"'), false);

  // Escaped form must be present inside the alert
  assertStringIncludes(body, 'cms-alert-error');
  assertStringIncludes(
    body,
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  );
  assertStringIncludes(body, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
