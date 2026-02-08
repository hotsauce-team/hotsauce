// deno-lint-ignore-file require-await
// Plugin registry tests

import { assertEquals, assertThrows } from '@std/assert';
import {
  createPluginRegistry,
  PluginRegistry,
  PluginValidationError,
} from '../plugins/registry.ts';
import type {
  PluginConfig,
  PluginRoute,
  PluginRouteHandler,
} from '../plugins/types.ts';

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const minimalPlugin: PluginConfig = {
  name: 'minimal-plugin',
  filter: 'dangerously-open',
};

const pluginWithTransforms: PluginConfig = {
  name: 'transform-plugin',
  filter: (ctx) => ctx.hookType.startsWith('transform'),
  capabilities: {
    transforms: ['beforeSave', 'afterRead'],
  },
  hooks: {
    transform: {
      beforeSave: async (_ctx, data) => data,
      afterRead: async (_ctx, data) => data,
    },
  },
};

const pluginWithActions: PluginConfig = {
  name: 'action-plugin',
  filter: (ctx) => ctx.hookType === 'action',
  capabilities: {
    actions: ['create', 'update', 'delete'],
  },
  hooks: {
    on: {
      create: async () => {},
      update: { handler: async () => {}, blocking: false },
      delete: { handler: async () => {}, blocking: true },
    },
  },
};

const pluginWithRoutes: PluginConfig = {
  name: 'routes-plugin',
  filter: 'dangerously-open',
  capabilities: {
    routes: ['/upload'],
  },
  routes: [
    {
      pattern: 'upload',
      methods: ['POST'],
      handler: async () => 'uploaded',
    },
  ],
};

const fullPlugin: PluginConfig = {
  name: 'full-plugin',
  description: 'A plugin with everything',
  filter: (ctx) => ctx.table !== 'sessions',
  capabilities: {
    transforms: ['beforeSave'],
    actions: ['create'],
    routes: ['/custom'],
    network: ['api.example.com'],
  },
  hooks: {
    transform: {
      beforeSave: async (_ctx, data) => ({ ...data, modified: true }),
    },
    on: {
      create: { handler: async () => {}, blocking: false },
    },
  },
  routes: [
    {
      pattern: 'custom',
      methods: ['GET'],
      handler: async () => 'custom page',
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Registration tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: registers minimal plugin', () => {
  const registry = new PluginRegistry();
  registry.register(minimalPlugin);

  const registered = registry.get('minimal-plugin');
  assertEquals(registered?.plugin.name, 'minimal-plugin');
  assertEquals(registered?.initialized, false);
});

Deno.test('PluginRegistry: registers plugin with config', () => {
  const registry = new PluginRegistry();
  const config = { apiKey: 'secret', maxSize: 1024 };

  registry.register({ ...minimalPlugin, config });

  const registered = registry.get('minimal-plugin');
  assertEquals(registered?.plugin.config, config);
});

Deno.test('PluginRegistry: registerAll registers multiple plugins', () => {
  const registry = new PluginRegistry();
  registry.registerAll([
    minimalPlugin,
    pluginWithTransforms,
    pluginWithActions,
  ]);

  assertEquals(registry.getAll().length, 3);
  assertEquals(registry.get('minimal-plugin')?.plugin.name, 'minimal-plugin');
  assertEquals(
    registry.get('transform-plugin')?.plugin.name,
    'transform-plugin',
  );
  assertEquals(registry.get('action-plugin')?.plugin.name, 'action-plugin');
});

Deno.test('PluginRegistry: rejects duplicate plugin names', () => {
  const registry = new PluginRegistry();
  registry.register(minimalPlugin);

  assertThrows(
    () => registry.register(minimalPlugin),
    PluginValidationError,
    'already registered',
  );
});

Deno.test('createPluginRegistry: creates registry with plugins', () => {
  const registry = createPluginRegistry([
    minimalPlugin,
    pluginWithTransforms,
  ]);

  assertEquals(registry.getAll().length, 2);
});

// ─────────────────────────────────────────────────────────────
// Validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: rejects plugin without name', () => {
  const registry = new PluginRegistry();
  const badPlugin = {} as PluginConfig;

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'valid name',
  );
});

Deno.test('PluginRegistry: rejects plugin with empty name', () => {
  const registry = new PluginRegistry();
  const badPlugin = { name: '' } as PluginConfig;

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'valid name',
  );
});

Deno.test('PluginRegistry: rejects plugin with invalid name format', () => {
  const registry = new PluginRegistry();

  // Starts with number
  assertThrows(
    () => registry.register({ name: '123-plugin', filter: 'dangerously-open' }),
    PluginValidationError,
    'start with a letter',
  );

  // Contains invalid characters
  assertThrows(
    () => registry.register({ name: 'my_plugin', filter: 'dangerously-open' }),
    PluginValidationError,
    'letters, numbers, and hyphens',
  );

  // Contains spaces
  assertThrows(
    () => registry.register({ name: 'my plugin', filter: 'dangerously-open' }),
    PluginValidationError,
    'letters, numbers, and hyphens',
  );
});

Deno.test('PluginRegistry: rejects plugin without filter', () => {
  const registry = new PluginRegistry();
  // Cast to bypass TypeScript - simulates runtime JS usage
  const badPlugin = { name: 'no-filter' } as PluginConfig;

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'filter is required',
  );
});

Deno.test('PluginRegistry: rejects plugin with invalid filter type', () => {
  const registry = new PluginRegistry();
  // Cast to bypass TypeScript - simulates runtime JS usage
  const badPlugin = {
    name: 'bad-filter',
    filter: 'open', // should be 'dangerously-open' or function
  } as unknown as PluginConfig;

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    "must be a function or 'dangerously-open'",
  );
});

Deno.test('PluginRegistry: accepts filter function', () => {
  const registry = new PluginRegistry();
  registry.register({
    name: 'filter-fn',
    filter: (ctx) => ctx.table === 'posts',
  });

  assertEquals(registry.get('filter-fn')?.plugin.name, 'filter-fn');
});

Deno.test("PluginRegistry: accepts filter 'dangerously-open'", () => {
  const registry = new PluginRegistry();
  registry.register({
    name: 'filter-open',
    filter: 'dangerously-open',
  });

  assertEquals(registry.get('filter-open')?.plugin.name, 'filter-open');
});

Deno.test('PluginRegistry: accepts valid plugin names', () => {
  const registry = new PluginRegistry();

  // All these should work
  registry.register({ name: 'a', filter: 'dangerously-open' });
  registry.register({ name: 'my-plugin', filter: 'dangerously-open' });
  registry.register({ name: 'Plugin123', filter: 'dangerously-open' });
  registry.register({ name: 'UPPERCASE', filter: 'dangerously-open' });
  registry.register({ name: 'with-numbers-123', filter: 'dangerously-open' });

  assertEquals(registry.getAll().length, 5);
});

Deno.test('PluginRegistry: validates route must have handler or render', () => {
  const registry = new PluginRegistry();
  const badPlugin: PluginConfig = {
    name: 'bad-routes',
    filter: 'dangerously-open',
    routes: [
      {
        pattern: 'upload',
        methods: ['POST'],
        // Missing both handler and render
      } as PluginRoute,
    ],
  };

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'must have either handler or render',
  );
});

Deno.test('PluginRegistry: validates route methods', () => {
  const registry = new PluginRegistry();
  const badPlugin: PluginConfig = {
    name: 'bad-method',
    filter: 'dangerously-open',
    routes: [
      {
        pattern: 'upload',
        methods: ['PATCH' as 'POST'],
        handler: async () => 'ok',
      },
    ],
  };

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'Invalid route method',
  );
});

Deno.test('PluginRegistry: validates route handler is function', () => {
  const registry = new PluginRegistry();
  const badPlugin: PluginConfig = {
    name: 'bad-handler',
    filter: 'dangerously-open',
    routes: [
      {
        pattern: 'upload',
        methods: ['POST'],
        handler: 'not a function' as unknown as PluginRouteHandler,
      },
    ],
  };

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'must be a function',
  );
});

// ─────────────────────────────────────────────────────────────
// Capability validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: rejects undeclared transform hooks', () => {
  const registry = new PluginRegistry();
  const badPlugin: PluginConfig = {
    name: 'undeclared-transform',
    filter: 'dangerously-open',
    capabilities: {
      transforms: ['beforeSave'], // Only declares beforeSave
    },
    hooks: {
      transform: {
        beforeSave: async (_ctx, data) => data,
        afterRead: async (_ctx, data) => data, // Not declared!
      },
    },
  };

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'afterRead',
  );
});

Deno.test('PluginRegistry: rejects undeclared action hooks', () => {
  const registry = new PluginRegistry();
  const badPlugin: PluginConfig = {
    name: 'undeclared-action',
    filter: 'dangerously-open',
    capabilities: {
      actions: ['create'], // Only declares create
    },
    hooks: {
      on: {
        create: async () => {},
        delete: async () => {}, // Not declared!
      },
    },
  };

  assertThrows(
    () => registry.register(badPlugin),
    PluginValidationError,
    'delete',
  );
});

Deno.test('PluginRegistry: allows hooks without capabilities (no validation)', () => {
  const registry = new PluginRegistry();
  // When capabilities is not specified, no validation happens
  const plugin: PluginConfig = {
    name: 'no-caps',
    filter: 'dangerously-open',
    hooks: {
      transform: {
        beforeSave: async (_ctx, data) => data,
      },
      on: {
        create: async () => {},
      },
    },
  };

  // Should not throw
  registry.register(plugin);
  assertEquals(registry.get('no-caps')?.plugin.name, 'no-caps');
});

// ─────────────────────────────────────────────────────────────
// Query tests
// ─────────────────────────────────────────────────────────────

// Mock Worker for testing
class MockWorker {
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: ErrorEvent) => void;
  postMessage(_message: unknown) {}
  terminate() {}
}

Deno.test('PluginRegistry: getPluginsWithTransform finds correct plugins', () => {
  const registry = createPluginRegistry([
    minimalPlugin,
    pluginWithTransforms,
    pluginWithActions,
    fullPlugin,
  ]);

  const beforeSavePlugins = registry.getPluginsWithTransform('beforeSave');
  assertEquals(beforeSavePlugins.length, 2);
  assertEquals(beforeSavePlugins.map((p) => p.plugin.name).sort(), [
    'full-plugin',
    'transform-plugin',
  ]);

  const afterReadPlugins = registry.getPluginsWithTransform('afterRead');
  assertEquals(afterReadPlugins.length, 1);
  assertEquals(afterReadPlugins[0]?.plugin.name, 'transform-plugin');
});

Deno.test('PluginRegistry: getPluginsWithAction finds correct plugins', () => {
  const registry = createPluginRegistry([
    minimalPlugin,
    pluginWithTransforms,
    pluginWithActions,
    fullPlugin,
  ]);

  const createPlugins = registry.getPluginsWithAction('create');
  assertEquals(createPlugins.length, 2);
  assertEquals(createPlugins.map((p) => p.plugin.name).sort(), [
    'action-plugin',
    'full-plugin',
  ]);

  const deletePlugins = registry.getPluginsWithAction('delete');
  assertEquals(deletePlugins.length, 1);
  assertEquals(deletePlugins[0]?.plugin.name, 'action-plugin');

  const listPlugins = registry.getPluginsWithAction('list');
  assertEquals(listPlugins.length, 0);
});

Deno.test('PluginRegistry: getAllRoutes collects routes from all plugins', () => {
  const registry = createPluginRegistry([
    minimalPlugin,
    pluginWithRoutes,
    fullPlugin,
  ]);

  const routes = registry.getAllRoutes();
  assertEquals(routes.length, 2);
  assertEquals(routes.map((r) => r.route.pattern).sort(), ['custom', 'upload']);
  assertEquals(
    routes.find((r) => r.route.pattern === 'upload')?.pluginName,
    'routes-plugin',
  );
  assertEquals(
    routes.find((r) => r.route.pattern === 'custom')?.pluginName,
    'full-plugin',
  );
});

// ─────────────────────────────────────────────────────────────
// Worker plugin validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: accepts Worker plugin with declarative hooks', () => {
  const registry = new PluginRegistry();
  registry.register({
    name: 'worker-declarative',
    worker: new MockWorker() as unknown as Worker,
    filter: 'dangerously-open',
    hooks: {
      transform: ['beforeSave', 'afterRead'],
      on: ['create', 'update', 'delete'],
    },
  });

  const plugin = registry.get('worker-declarative');
  assertEquals(plugin?.isWorker, true);
});

Deno.test('PluginRegistry: rejects Worker plugin with function hooks', () => {
  const registry = new PluginRegistry();

  // Try to register Worker plugin with function transform hooks
  assertThrows(
    () =>
      registry.register({
        name: 'worker-fn-hooks',
        worker: new MockWorker() as unknown as Worker,
        filter: 'dangerously-open',
        hooks: {
          transform: {
            beforeSave: async (_ctx: unknown, data: Record<string, unknown>) =>
              data,
          },
        },
      } as unknown as PluginConfig),
    PluginValidationError,
    'declarative hooks',
  );

  // Try to register Worker plugin with function action hooks
  assertThrows(
    () =>
      registry.register({
        name: 'worker-fn-actions',
        worker: new MockWorker() as unknown as Worker,
        filter: 'dangerously-open',
        hooks: {
          on: {
            create: async () => {},
          },
        },
      } as unknown as PluginConfig),
    PluginValidationError,
    'declarative hooks',
  );
});

Deno.test('PluginRegistry: validates Worker hook names', () => {
  const registry = new PluginRegistry();

  // Invalid transform hook name
  assertThrows(
    () =>
      registry.register({
        name: 'worker-bad-transform',
        worker: new MockWorker() as unknown as Worker,
        filter: 'dangerously-open',
        hooks: {
          transform: [
            'beforeSave',
            'invalidHook',
          ] as ('beforeSave' | 'afterRead')[],
        },
      }),
    PluginValidationError,
    'Invalid transform hook',
  );

  // Invalid action hook name
  assertThrows(
    () =>
      registry.register({
        name: 'worker-bad-action',
        worker: new MockWorker() as unknown as Worker,
        filter: 'dangerously-open',
        hooks: {
          on: [
            'create',
            'invalid',
          ] as ('create' | 'update' | 'delete' | 'read' | 'list')[],
        },
      }),
    PluginValidationError,
    'Invalid action hook',
  );
});

Deno.test('PluginRegistry: rejects Worker plugin with routes', () => {
  const registry = new PluginRegistry();

  assertThrows(
    () =>
      registry.register({
        name: 'worker-with-handler-route',
        worker: new MockWorker() as unknown as Worker,
        filter: 'dangerously-open',
        routes: [
          {
            pattern: 'upload',
            methods: ['POST'],
            handler: async () => 'ok', // Worker routes must use render, not handler
          },
        ],
      } as unknown as PluginConfig),
    PluginValidationError,
    'cannot use handler', // Worker routes must use render instead
  );
});

Deno.test('PluginRegistry: accepts Worker plugin without hooks (all hooks)', () => {
  const registry = new PluginRegistry();
  registry.register({
    name: 'worker-no-hooks',
    worker: new MockWorker() as unknown as Worker,
    filter: 'dangerously-open',
  });

  // Worker without hooks should match all hook queries
  const beforeSavePlugins = registry.getPluginsWithTransform('beforeSave');
  assertEquals(beforeSavePlugins.length, 1);
  assertEquals(beforeSavePlugins[0]?.plugin.name, 'worker-no-hooks');

  const createPlugins = registry.getPluginsWithAction('create');
  assertEquals(createPlugins.length, 1);
  assertEquals(createPlugins[0]?.plugin.name, 'worker-no-hooks');
});

Deno.test('PluginRegistry: getPluginsWithTransform filters Worker by declarative hooks', () => {
  const registry = createPluginRegistry([
    {
      name: 'worker-before-only',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { transform: ['beforeSave'] },
    },
    {
      name: 'worker-after-only',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { transform: ['afterRead'] },
    },
    {
      name: 'worker-both',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { transform: ['beforeSave', 'afterRead'] },
    },
  ]);

  const beforeSavePlugins = registry.getPluginsWithTransform('beforeSave');
  assertEquals(beforeSavePlugins.map((p) => p.plugin.name).sort(), [
    'worker-before-only',
    'worker-both',
  ]);

  const afterReadPlugins = registry.getPluginsWithTransform('afterRead');
  assertEquals(afterReadPlugins.map((p) => p.plugin.name).sort(), [
    'worker-after-only',
    'worker-both',
  ]);
});

Deno.test('PluginRegistry: getPluginsWithAction filters Worker by declarative hooks', () => {
  const registry = createPluginRegistry([
    {
      name: 'worker-create-only',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { on: ['create'] },
    },
    {
      name: 'worker-delete-only',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { on: ['delete'] },
    },
    {
      name: 'worker-all-actions',
      worker: new MockWorker() as unknown as Worker,
      filter: 'dangerously-open',
      hooks: { on: ['create', 'update', 'delete'] },
    },
  ]);

  const createPlugins = registry.getPluginsWithAction('create');
  assertEquals(createPlugins.map((p) => p.plugin.name).sort(), [
    'worker-all-actions',
    'worker-create-only',
  ]);

  const deletePlugins = registry.getPluginsWithAction('delete');
  assertEquals(deletePlugins.map((p) => p.plugin.name).sort(), [
    'worker-all-actions',
    'worker-delete-only',
  ]);

  const listPlugins = registry.getPluginsWithAction('list');
  assertEquals(listPlugins.length, 0);
});

// ─────────────────────────────────────────────────────────────
// In-process plugin validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: rejects in-process plugin with declarative hooks', () => {
  const registry = new PluginRegistry();

  // Declarative transform hooks (array instead of object)
  assertThrows(
    () =>
      registry.register({
        name: 'inprocess-array-transform',
        filter: 'dangerously-open',
        hooks: {
          transform: ['beforeSave'] as unknown as {
            beforeSave: () => Promise<Record<string, unknown>>;
          },
        },
      } as unknown as PluginConfig),
    PluginValidationError,
    'function hooks',
  );

  // Declarative action hooks (array instead of object)
  assertThrows(
    () =>
      registry.register({
        name: 'inprocess-array-actions',
        filter: 'dangerously-open',
        hooks: {
          on: ['create'] as unknown as { create: () => Promise<void> },
        },
      } as unknown as PluginConfig),
    PluginValidationError,
    'function hooks',
  );
});
