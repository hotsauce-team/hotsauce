// Rate-limit hint level tests (see ../README.md, "Rate-limit hints")
//
// The exhaustive classification step is the contract: every built-in route
// class and plugin-route declaration must map to an explicit expected level.
// A new route class that no expectation covers should fail here, not ship
// unclassified.

import { assertEquals, assertThrows } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { introspectFullSchema } from '@hotsauce/core';
import {
  createBasicTables,
  schema,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import {
  createCmsHandler,
  getRouteInfo,
  RATE_LIMIT_LEVEL_HEADER,
} from '../mod.ts';
import {
  _resetRateLimitHintsStateForTests,
  classifyCmsRequest,
  deriveRateLimitLevel,
  registerRateLimitHintsMode,
} from '../rate-limit-hints.ts';
import type { PluginConfig } from '../plugins/types.ts';

// Test plugin exercising every plugin-route declaration shape
const hintTestPlugin: PluginConfig = {
  name: 'hint-test',
  filter: 'dangerously-open',
  routes: [
    { pattern: 'plain', methods: ['GET'], handler: () => new Response('ok') },
    {
      pattern: 'verify',
      methods: ['GET'],
      bruteForceable: true,
      handler: () => new Response('ok'),
    },
    {
      pattern: 'heavy',
      methods: ['GET'],
      resourceIntensive: true,
      handler: () => new Response('ok'),
    },
    {
      pattern: 'override',
      methods: ['GET'],
      rateLimitLevel: 3,
      handler: () => new Response('ok'),
    },
  ],
};

const classifyCtx = {
  basePath: '/admin',
  tables: introspectFullSchema(schema).tables,
  plugins: [hintTestPlugin],
};

function classify(method: string, path: string) {
  return classifyCmsRequest(
    new Request(`http://localhost${path}`, { method }),
    classifyCtx,
  );
}

Deno.test('rate-limit hints: deriveRateLimitLevel', () => {
  assertEquals(deriveRateLimitLevel({}), 1);
  assertEquals(deriveRateLimitLevel({ resourceIntensive: true }), 2);
  assertEquals(deriveRateLimitLevel({ bruteForceable: true }), 3);
  assertEquals(
    deriveRateLimitLevel({ bruteForceable: true, resourceIntensive: true }),
    3,
  );
});

Deno.test('rate-limit hints: exhaustive route classification', () => {
  // [method, path, expected level]
  const cases: Array<[string, string, 1 | 2 | 3]> = [
    // Assets
    ['GET', '/admin/styles.css', 1],
    ['GET', '/admin/admin.js', 1],
    ['GET', '/admin/picker.js', 1],
    // Auth
    ['GET', '/admin/login', 1],
    ['POST', '/admin/login', 3], // password check + TOTP phase 2
    ['POST', '/admin/logout', 1],
    // Account screens
    ['GET', '/admin/account', 1],
    ['GET', '/admin/account/password', 1],
    ['POST', '/admin/account/password', 3],
    ['GET', '/admin/account/2fa', 1],
    ['POST', '/admin/account/2fa/enable', 3],
    ['POST', '/admin/account/2fa/disable', 3],
    // Dashboard
    ['GET', '/admin', 1],
    ['GET', '/admin/', 1],
    // File serving
    ['GET', '/admin/files/users/avatar/1', 2],
    // Plugin routes
    ['GET', '/admin/hint-test/plain', 1],
    ['GET', '/admin/hint-test/verify', 3],
    ['GET', '/admin/hint-test/heavy', 2],
    ['GET', '/admin/hint-test/override', 3],
    // Nothing matched — baseline
    ['GET', '/admin/no-such-table', 1],
    ['GET', '/outside-cms', 1],
  ];

  // CRUD paths for every table in the schema
  for (const table of classifyCtx.tables) {
    cases.push(
      ['GET', `/admin/${table.name}`, 2], // list
      ['GET', `/admin/${table.name}/new`, 1], // create form
      ['POST', `/admin/${table.name}/new`, 2], // create submit
      ['GET', `/admin/${table.name}/1`, 1], // detail
      ['POST', `/admin/${table.name}/1`, 2], // update via POST-to-resource
      ['GET', `/admin/${table.name}/1/edit`, 1], // edit form
      ['POST', `/admin/${table.name}/1/edit`, 2], // update submit
      ['POST', `/admin/${table.name}/1/delete`, 2], // delete submit
    );
  }

  for (const [method, path, expected] of cases) {
    const info = classify(method, path);
    assertEquals(
      info.level,
      expected,
      `${method} ${path}: expected level ${expected}, got ${info.level}`,
    );
    // Level must always agree with the facts it derives from (no drift)
    if (info.level !== classify(method, path).level) {
      throw new Error('non-deterministic classification');
    }
  }

  // Facts round-trip for the fact-declared plugin routes
  assertEquals(classify('GET', '/admin/hint-test/verify').bruteForceable, true);
  assertEquals(
    classify('GET', '/admin/hint-test/heavy').resourceIntensive,
    true,
  );
  // Explicit override wins without asserting facts
  const override = classify('GET', '/admin/hint-test/override');
  assertEquals(override.level, 3);
  assertEquals(override.bruteForceable, false);
});

Deno.test('rate-limit hints: handler end-to-end', async (t) => {
  // Neutralize the disabled-handler warning path for this test's accessor
  // calls; the warning itself is covered by the dedicated test below.
  _resetRateLimitHintsStateForTests();
  registerRateLimitHintsMode(true);

  const client = new PGlite();
  const db = drizzle(client, { schema });
  await createBasicTables(db);

  function createHandler(
    rateLimitHints: false | 'in-process' | 'header',
  ) {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      db,
      schema,
      basePath: '/admin',
      plugins: [hintTestPlugin],
      rateLimitHints,
    });
  }

  await t.step('default off: no header, accessor undefined', async () => {
    const handler = createHandler(false);
    for (const path of ['/admin', '/admin/users', '/admin/login']) {
      const response = await handler(new Request(`http://localhost${path}`));
      assertEquals(response.headers.get(RATE_LIMIT_LEVEL_HEADER), null);
      assertEquals(getRouteInfo(response), undefined);
    }
  });

  await t.step('in-process: accessor populated, no header', async () => {
    const handler = createHandler('in-process');
    const response = await handler(new Request('http://localhost/admin/users'));
    assertEquals(response.headers.get(RATE_LIMIT_LEVEL_HEADER), null);
    assertEquals(getRouteInfo(response)?.level, 2);
    assertEquals(getRouteInfo(response)?.resourceIntensive, true);
  });

  await t.step('header: header set and equals accessor', async () => {
    const handler = createHandler('header');
    const expectations: Array<[string, string, string]> = [
      ['GET', '/admin', '1'],
      ['GET', '/admin/users', '2'],
      ['POST', '/admin/login', '3'],
      ['GET', '/admin/hint-test/verify', '3'],
      ['GET', '/admin/hint-test/plain', '1'],
    ];
    for (const [method, path, level] of expectations) {
      const response = await handler(
        new Request(`http://localhost${path}`, { method }),
      );
      assertEquals(
        response.headers.get(RATE_LIMIT_LEVEL_HEADER),
        level,
        `${method} ${path}`,
      );
      assertEquals(String(getRouteInfo(response)?.level), level);
    }
  });

  await t.step(
    'mutation submits carry level 2 regardless of outcome',
    async () => {
      const handler = createHandler('header');
      // No CSRF token → the submit is rejected (re-rendered form), but
      // classification is by route, not outcome
      const response = await handler(
        new Request('http://localhost/admin/users/new', {
          method: 'POST',
          body: new FormData(),
        }),
      );
      assertEquals(response.headers.get(RATE_LIMIT_LEVEL_HEADER), '2');
      await response.body?.cancel();
    },
  );

  await t.step('cloned Response is not in the WeakMap', async () => {
    const handler = createHandler('in-process');
    const response = await handler(new Request('http://localhost/admin'));
    assertEquals(getRouteInfo(response)?.level, 1);
    const rebuilt = new Response(response.body, response);
    assertEquals(getRouteInfo(rebuilt), undefined);
    await rebuilt.body?.cancel();
  });

  await t.step('invalid plugin rateLimitLevel rejected at registration', () => {
    assertThrows(
      () =>
        createCmsHandler({
          csrfSecret: TEST_CSRF_SECRET,
          auth: 'dangerously-open',
          policies: 'dangerously-open',
          db,
          schema,
          basePath: '/admin',
          plugins: [{
            name: 'bad-level',
            filter: 'dangerously-open',
            routes: [{
              pattern: 'x',
              methods: ['GET'],
              // deno-lint-ignore no-explicit-any
              rateLimitLevel: 5 as any,
              handler: () => new Response('ok'),
            }],
          }],
        }),
      Error,
      'rateLimitLevel must be 1, 2, or 3',
    );
  });

  await client.close();
});

Deno.test('rate-limit hints: disabled-handler warning fires once', () => {
  // deno-lint-ignore no-console
  const originalWarn = console.warn;
  const warnings: string[] = [];
  // deno-lint-ignore no-console
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    // No handler constructed yet → no warning
    _resetRateLimitHintsStateForTests();
    getRouteInfo(new Response('x'));
    assertEquals(warnings.length, 0);

    // Only disabled handlers exist → warn exactly once
    registerRateLimitHintsMode(false);
    getRouteInfo(new Response('x'));
    getRouteInfo(new Response('x'));
    assertEquals(warnings.length, 1);
    assertEquals(warnings[0]?.includes('rateLimitHints'), true);

    // An enabled handler exists → never warns
    _resetRateLimitHintsStateForTests();
    registerRateLimitHintsMode(false);
    registerRateLimitHintsMode(true);
    getRouteInfo(new Response('x'));
    assertEquals(warnings.length, 1);
  } finally {
    // deno-lint-ignore no-console
    console.warn = originalWarn;
    _resetRateLimitHintsStateForTests();
    // Later tests construct handlers; re-register a neutral enabled state so
    // cross-file test order cannot re-trigger the warning path.
    registerRateLimitHintsMode(true);
  }
});
