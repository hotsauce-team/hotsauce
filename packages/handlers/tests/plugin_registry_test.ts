// Plugin registry tests

import { assertEquals, assertThrows } from 'jsr:@std/assert';
import {
  PluginRegistry,
  PluginValidationError,
  createPluginRegistry,
} from '../plugins/registry.ts';
import type { Plugin } from '../plugins/types.ts';

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const minimalPlugin: Plugin = {
  name: 'minimal-plugin',
};

const pluginWithTransforms: Plugin = {
  name: 'transform-plugin',
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

const pluginWithActions: Plugin = {
  name: 'action-plugin',
  capabilities: {
    actions: ['create', 'update', 'delete'],
  },
  hooks: {
    on: {
      create: async () => {},
      update: { handler: async () => {}, fireAndForget: true },
      delete: { handler: async () => {}, fireAndForget: false },
    },
  },
};

const pluginWithRoutes: Plugin = {
  name: 'routes-plugin',
  capabilities: {
    routes: ['/upload'],
  },
  routes: [
    {
      path: '/upload',
      method: 'POST',
      handler: async () => ({ status: 200, body: { ok: true } }),
    },
  ],
};

const fullPlugin: Plugin = {
  name: 'full-plugin',
  description: 'A plugin with everything',
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
      create: { handler: async () => {}, fireAndForget: true },
    },
  },
  routes: [
    {
      path: '/custom',
      method: 'GET',
      handler: async () => ({ status: 200, body: {} }),
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// Registration tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: registers minimal plugin', () => {
  const registry = new PluginRegistry();
  registry.register({ plugin: minimalPlugin });

  const registered = registry.get('minimal-plugin');
  assertEquals(registered?.plugin.name, 'minimal-plugin');
  assertEquals(registered?.initialized, false);
});

Deno.test('PluginRegistry: registers plugin with config', () => {
  const registry = new PluginRegistry();
  const config = { apiKey: 'secret', maxSize: 1024 };

  registry.register({ plugin: minimalPlugin, config });

  const registered = registry.get('minimal-plugin');
  assertEquals(registered?.config, config);
});

Deno.test('PluginRegistry: registerAll registers multiple plugins', () => {
  const registry = new PluginRegistry();
  registry.registerAll([
    { plugin: minimalPlugin },
    { plugin: pluginWithTransforms },
    { plugin: pluginWithActions },
  ]);

  assertEquals(registry.getAll().length, 3);
  assertEquals(registry.get('minimal-plugin')?.plugin.name, 'minimal-plugin');
  assertEquals(registry.get('transform-plugin')?.plugin.name, 'transform-plugin');
  assertEquals(registry.get('action-plugin')?.plugin.name, 'action-plugin');
});

Deno.test('PluginRegistry: rejects duplicate plugin names', () => {
  const registry = new PluginRegistry();
  registry.register({ plugin: minimalPlugin });

  assertThrows(
    () => registry.register({ plugin: minimalPlugin }),
    PluginValidationError,
    'already registered'
  );
});

Deno.test('createPluginRegistry: creates registry with plugins', () => {
  const registry = createPluginRegistry([
    { plugin: minimalPlugin },
    { plugin: pluginWithTransforms },
  ]);

  assertEquals(registry.getAll().length, 2);
});

Deno.test('createPluginRegistry: accepts sandbox mode', () => {
  const registry = createPluginRegistry([], 'deno-sandbox');
  assertEquals(registry.getSandboxMode(), 'deno-sandbox');
});

// ─────────────────────────────────────────────────────────────
// Validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: rejects plugin without name', () => {
  const registry = new PluginRegistry();
  const badPlugin = { } as Plugin;

  assertThrows(
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'valid name'
  );
});

Deno.test('PluginRegistry: rejects plugin with empty name', () => {
  const registry = new PluginRegistry();
  const badPlugin = { name: '' } as Plugin;

  assertThrows(
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'valid name'
  );
});

Deno.test('PluginRegistry: rejects plugin with invalid name format', () => {
  const registry = new PluginRegistry();

  // Starts with number
  assertThrows(
    () => registry.register({ plugin: { name: '123-plugin' } }),
    PluginValidationError,
    'start with a letter'
  );

  // Contains invalid characters
  assertThrows(
    () => registry.register({ plugin: { name: 'my_plugin' } }),
    PluginValidationError,
    'letters, numbers, and hyphens'
  );

  // Contains spaces
  assertThrows(
    () => registry.register({ plugin: { name: 'my plugin' } }),
    PluginValidationError,
    'letters, numbers, and hyphens'
  );
});

Deno.test('PluginRegistry: accepts valid plugin names', () => {
  const registry = new PluginRegistry();

  // All these should work
  registry.register({ plugin: { name: 'a' } });
  registry.register({ plugin: { name: 'my-plugin' } });
  registry.register({ plugin: { name: 'Plugin123' } });
  registry.register({ plugin: { name: 'UPPERCASE' } });
  registry.register({ plugin: { name: 'with-numbers-123' } });

  assertEquals(registry.getAll().length, 5);
});

Deno.test('PluginRegistry: validates route path starts with /', () => {
  const registry = new PluginRegistry();
  const badPlugin: Plugin = {
    name: 'bad-routes',
    routes: [
      { path: 'upload', method: 'POST', handler: async () => ({ status: 200 }) },
    ],
  };

  assertThrows(
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'start with /'
  );
});

Deno.test('PluginRegistry: validates route method', () => {
  const registry = new PluginRegistry();
  const badPlugin: Plugin = {
    name: 'bad-method',
    routes: [
      { path: '/upload', method: 'PATCH' as 'POST', handler: async () => ({ status: 200 }) },
    ],
  };

  assertThrows(
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'Invalid route method'
  );
});

Deno.test('PluginRegistry: validates route handler is function', () => {
  const registry = new PluginRegistry();
  const badPlugin: Plugin = {
    name: 'bad-handler',
    routes: [
      { path: '/upload', method: 'POST', handler: 'not a function' as unknown as () => Promise<{ status: number }> },
    ],
  };

  assertThrows(
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'must be a function'
  );
});

// ─────────────────────────────────────────────────────────────
// Capability validation tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: rejects undeclared transform hooks', () => {
  const registry = new PluginRegistry();
  const badPlugin: Plugin = {
    name: 'undeclared-transform',
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
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'afterRead'
  );
});

Deno.test('PluginRegistry: rejects undeclared action hooks', () => {
  const registry = new PluginRegistry();
  const badPlugin: Plugin = {
    name: 'undeclared-action',
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
    () => registry.register({ plugin: badPlugin }),
    PluginValidationError,
    'delete'
  );
});

Deno.test('PluginRegistry: allows hooks without capabilities (no validation)', () => {
  const registry = new PluginRegistry();
  // When capabilities is not specified, no validation happens
  const plugin: Plugin = {
    name: 'no-caps',
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
  registry.register({ plugin });
  assertEquals(registry.get('no-caps')?.plugin.name, 'no-caps');
});

// ─────────────────────────────────────────────────────────────
// Query tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: getPluginsWithTransform finds correct plugins', () => {
  const registry = createPluginRegistry([
    { plugin: minimalPlugin },
    { plugin: pluginWithTransforms },
    { plugin: pluginWithActions },
    { plugin: fullPlugin },
  ]);

  const beforeSavePlugins = registry.getPluginsWithTransform('beforeSave');
  assertEquals(beforeSavePlugins.length, 2);
  assertEquals(beforeSavePlugins.map(p => p.plugin.name).sort(), ['full-plugin', 'transform-plugin']);

  const afterReadPlugins = registry.getPluginsWithTransform('afterRead');
  assertEquals(afterReadPlugins.length, 1);
  assertEquals(afterReadPlugins[0]?.plugin.name, 'transform-plugin');
});

Deno.test('PluginRegistry: getPluginsWithAction finds correct plugins', () => {
  const registry = createPluginRegistry([
    { plugin: minimalPlugin },
    { plugin: pluginWithTransforms },
    { plugin: pluginWithActions },
    { plugin: fullPlugin },
  ]);

  const createPlugins = registry.getPluginsWithAction('create');
  assertEquals(createPlugins.length, 2);
  assertEquals(createPlugins.map(p => p.plugin.name).sort(), ['action-plugin', 'full-plugin']);

  const deletePlugins = registry.getPluginsWithAction('delete');
  assertEquals(deletePlugins.length, 1);
  assertEquals(deletePlugins[0]?.plugin.name, 'action-plugin');

  const listPlugins = registry.getPluginsWithAction('list');
  assertEquals(listPlugins.length, 0);
});

Deno.test('PluginRegistry: getAllRoutes collects routes from all plugins', () => {
  const registry = createPluginRegistry([
    { plugin: minimalPlugin },
    { plugin: pluginWithRoutes },
    { plugin: fullPlugin },
  ]);

  const routes = registry.getAllRoutes();
  assertEquals(routes.length, 2);
  assertEquals(routes.map(r => r.route.path).sort(), ['/custom', '/upload']);
  assertEquals(routes.find(r => r.route.path === '/upload')?.pluginName, 'routes-plugin');
  assertEquals(routes.find(r => r.route.path === '/custom')?.pluginName, 'full-plugin');
});

// ─────────────────────────────────────────────────────────────
// Sandbox mode tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginRegistry: getSandboxMode returns configured mode', () => {
  const workerRegistry = new PluginRegistry('worker');
  assertEquals(workerRegistry.getSandboxMode(), 'worker');

  const denoRegistry = new PluginRegistry('deno-sandbox');
  assertEquals(denoRegistry.getSandboxMode(), 'deno-sandbox');
});

Deno.test('PluginRegistry: defaults to worker sandbox mode', () => {
  const registry = new PluginRegistry();
  assertEquals(registry.getSandboxMode(), 'worker');
});

Deno.test('PluginRegistry: isDenoRuntime detects Deno', () => {
  const registry = new PluginRegistry();
  // We're running in Deno, so this should be true
  assertEquals(registry.isDenoRuntime(), true);
});

Deno.test('PluginRegistry: getEffectiveSandboxMode returns requested mode on Deno', () => {
  const registry = new PluginRegistry('deno-sandbox');
  // We're running in Deno, so deno-sandbox should be available
  assertEquals(registry.getEffectiveSandboxMode(), 'deno-sandbox');
});
