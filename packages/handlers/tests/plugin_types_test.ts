// Plugin types tests - validates type constraints and helpers

import { assertEquals } from 'jsr:@std/assert';
import type {
  ActionContext,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  FilterContext,
  HookType,
  PluginConfig,
  PluginContext,
  PluginFilter,
  Serializable,
  TransformHooks,
} from '../plugins/types.ts';

// ─────────────────────────────────────────────────────────────
// Serializable type tests (compile-time validation)
// ─────────────────────────────────────────────────────────────

Deno.test('Serializable: accepts primitive types', () => {
  const values: Serializable[] = [
    'string',
    123,
    45.67,
    true,
    false,
    null,
    undefined,
  ];
  assertEquals(values.length, 7);
});

Deno.test('Serializable: accepts Date', () => {
  const value: Serializable = new Date();
  assertEquals(value instanceof Date, true);
});

Deno.test('Serializable: accepts arrays', () => {
  const value: Serializable = [1, 'two', true, null, [1, 2, 3]];
  assertEquals(Array.isArray(value), true);
});

Deno.test('Serializable: accepts nested objects', () => {
  const value: Serializable = {
    name: 'test',
    count: 42,
    active: true,
    tags: ['a', 'b'],
    nested: {
      deep: {
        value: 123,
      },
    },
  };
  assertEquals(typeof value, 'object');
});

// ─────────────────────────────────────────────────────────────
// PluginContext tests
// ─────────────────────────────────────────────────────────────

Deno.test('PluginContext: minimal context', () => {
  const ctx: PluginContext = {
    table: 'users',
    action: 'create',
  };
  assertEquals(ctx.table, 'users');
  assertEquals(ctx.action, 'create');
  assertEquals(ctx.user, undefined);
});

Deno.test('PluginContext: with user', () => {
  const ctx: PluginContext = {
    table: 'posts',
    action: 'update',
    user: {
      sub: 'user-123',
      role: 'admin',
    },
  };
  assertEquals(ctx.user?.sub, 'user-123');
  assertEquals(ctx.user?.role, 'admin');
});

Deno.test('ActionContext: extends PluginContext', () => {
  const ctx: ActionContext = {
    table: 'posts',
    action: 'update',
    user: { sub: 'user-123' },
    recordId: 42,
    oldData: { title: 'Old Title' },
    newData: { title: 'New Title' },
    timestamp: '2026-01-21T10:00:00.000Z',
  };
  assertEquals(ctx.recordId, 42);
  assertEquals((ctx.oldData as Record<string, unknown>)?.title, 'Old Title');
  assertEquals((ctx.newData as Record<string, unknown>)?.title, 'New Title');
});

// ─────────────────────────────────────────────────────────────
// ActionHook tests
// ─────────────────────────────────────────────────────────────

Deno.test('ActionHook: function form (blocking by default)', () => {
  const hook: ActionHook = async (_ctx) => {
    // Do something
  };
  assertEquals(typeof hook, 'function');
});

Deno.test('ActionHook: config form with blocking: false (fire-and-forget)', () => {
  const hook: ActionHook = {
    handler: async (_ctx) => {},
    blocking: false,
  };
  assertEquals(typeof hook, 'object');
  assertEquals((hook as ActionHookConfig).blocking, false);
});

Deno.test('ActionHook: config form with blocking: true (explicit)', () => {
  const hook: ActionHook = {
    handler: async (_ctx) => {},
    blocking: true,
  };
  assertEquals((hook as ActionHookConfig).blocking, true);
});

// Helper to check if hook is blocking (waits for completion)
function isBlocking(hook: ActionHook): boolean {
  if (typeof hook === 'function') return true; // Default to blocking
  return hook.blocking !== false; // Default to blocking if not specified
}

Deno.test('ActionHook: isBlocking helper', () => {
  const blockingFn: ActionHook = async () => {};
  const blockingConfig: ActionHook = {
    handler: async () => {},
    blocking: true,
  };
  const fireAndForget: ActionHook = {
    handler: async () => {},
    blocking: false,
  };

  assertEquals(isBlocking(blockingFn), true);
  assertEquals(isBlocking(blockingConfig), true);
  assertEquals(isBlocking(fireAndForget), false);
});

// ─────────────────────────────────────────────────────────────
// Plugin definition tests
// ─────────────────────────────────────────────────────────────

Deno.test('Plugin: minimal definition', () => {
  const plugin: PluginConfig = {
    name: 'minimal',
    filter: 'dangerously-open',
  };
  assertEquals(plugin.name, 'minimal');
});

Deno.test('Plugin: with transforms only', () => {
  const plugin: PluginConfig = {
    name: 'transform-only',
    filter: (ctx) => ctx.hookType.startsWith('transform'),
    hooks: {
      transform: {
        beforeSave: async (
          _ctx: PluginContext,
          data: Record<string, Serializable>,
        ) => ({ ...data, modified: true }),
      },
    },
  };
  assertEquals(plugin.hooks?.transform?.beforeSave !== undefined, true);
  assertEquals(plugin.hooks?.on, undefined);
});

Deno.test('Plugin: with actions only', () => {
  const plugin: PluginConfig = {
    name: 'action-only',
    filter: (ctx) => ctx.hookType === 'action',
    hooks: {
      on: {
        create: async () => {},
        update: { handler: async () => {}, blocking: false },
      },
    },
  };
  assertEquals(plugin.hooks?.on?.create !== undefined, true);
  assertEquals(plugin.hooks?.on?.update !== undefined, true);
  assertEquals(plugin.hooks?.transform, undefined);
});

Deno.test('Plugin: with routes', () => {
  const plugin: PluginConfig = {
    name: 'with-routes',
    filter: 'dangerously-open',
    routes: [
      {
        path: '/api/custom',
        method: 'POST',
        handler: async (req: { body?: Serializable }) => ({
          status: 200,
          body: { received: req.body },
        }),
      },
    ],
  };
  assertEquals(plugin.routes?.length, 1);
  assertEquals(plugin.routes?.[0]?.path, '/api/custom');
});

Deno.test('Plugin: with capabilities', () => {
  const plugin: PluginConfig = {
    name: 'with-caps',
    filter: 'dangerously-open',
    capabilities: {
      network: ['api.example.com', '*.s3.amazonaws.com'],
      transforms: ['beforeSave'],
      actions: ['create', 'update'],
      routes: ['/upload'],
    },
  };
  assertEquals(plugin.capabilities?.network?.length, 2);
  assertEquals(plugin.capabilities?.transforms, ['beforeSave']);
  assertEquals(plugin.capabilities?.actions, ['create', 'update']);
});

Deno.test('Plugin: full example', () => {
  const plugin: PluginConfig = {
    name: 'audit-logger',
    description: 'Logs all CRUD operations to external service',
    filter: (ctx) =>
      ctx.hookType === 'action' &&
      ['create', 'update', 'delete'].includes(ctx.action),
    capabilities: {
      actions: ['create', 'update', 'delete'],
      network: ['audit.example.com'],
    },
    hooks: {
      on: {
        create: {
          handler: async (ctx: ActionContext) => {
            // Would send to audit service
            console.log('Created:', ctx.recordId);
          },
          blocking: false,
        },
        update: {
          handler: async (ctx: ActionContext) => {
            console.log('Updated:', ctx.recordId);
          },
          blocking: false,
        },
        delete: {
          handler: async (ctx: ActionContext) => {
            console.log('Deleted:', ctx.recordId);
          },
          blocking: false,
        },
      },
    },
  };

  assertEquals(plugin.name, 'audit-logger');
  assertEquals(plugin.capabilities?.actions?.length, 3);
  assertEquals(plugin.hooks?.on?.create !== undefined, true);
});

// ─────────────────────────────────────────────────────────────
// Transform execution simulation
// ─────────────────────────────────────────────────────────────

Deno.test('TransformHooks: beforeSave modifies data', async () => {
  const transforms: TransformHooks = {
    beforeSave: async (_ctx, data) => ({
      ...data,
      slug: String(data.title).toLowerCase().replace(/\s+/g, '-'),
      updatedAt: new Date().toISOString(),
    }),
  };

  const ctx: PluginContext = { table: 'posts', action: 'create' };
  const input = { title: 'Hello World', body: 'Content here' };
  const result = await transforms.beforeSave!(ctx, input);

  assertEquals((result as Record<string, unknown>).slug, 'hello-world');
  assertEquals((result as Record<string, unknown>).title, 'Hello World');
  assertEquals(
    (result as Record<string, unknown>).updatedAt !== undefined,
    true,
  );
});

Deno.test('TransformHooks: afterRead adds computed fields', async () => {
  const transforms: TransformHooks = {
    afterRead: async (_ctx, data) => ({
      ...data,
      fullName: `${data.firstName} ${data.lastName}`,
    }),
  };

  const ctx: PluginContext = { table: 'users', action: 'read' };
  const input = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
  };
  const result = await transforms.afterRead!(ctx, input);

  assertEquals((result as Record<string, unknown>).fullName, 'John Doe');
});

Deno.test('TransformHooks: chain multiple transforms', async () => {
  const transform1: TransformHooks = {
    beforeSave: async (_ctx, data) => ({ ...data, step1: true }),
  };
  const transform2: TransformHooks = {
    beforeSave: async (_ctx, data) => ({ ...data, step2: true }),
  };

  const ctx: PluginContext = { table: 'test', action: 'create' };
  let data: Record<string, Serializable> = { original: true };

  data = await transform1.beforeSave!(ctx, data) as Record<
    string,
    Serializable
  >;
  data = await transform2.beforeSave!(ctx, data) as Record<
    string,
    Serializable
  >;

  assertEquals(data.original, true);
  assertEquals(data.step1, true);
  assertEquals(data.step2, true);
});

// ─────────────────────────────────────────────────────────────
// Action execution simulation
// ─────────────────────────────────────────────────────────────

Deno.test('ActionHooks: executes on specific actions', async () => {
  const log: string[] = [];

  const actions: ActionHooks = {
    create: async (ctx) => {
      log.push(`created ${ctx.recordId}`);
    },
    update: async (ctx) => {
      log.push(`updated ${ctx.recordId}`);
    },
  };

  const createCtx: ActionContext = {
    table: 'posts',
    action: 'create',
    recordId: 1,
    timestamp: new Date().toISOString(),
  };
  const updateCtx: ActionContext = {
    table: 'posts',
    action: 'update',
    recordId: 2,
    timestamp: new Date().toISOString(),
  };

  // Get handler (handles both function and config forms)
  const getHandler = (hook: ActionHook | undefined) => {
    if (!hook) return null;
    return typeof hook === 'function' ? hook : hook.handler;
  };

  await getHandler(actions.create)!(createCtx);
  await getHandler(actions.update)!(updateCtx);

  assertEquals(log, ['created 1', 'updated 2']);
});

Deno.test('ActionHooks: mixed blocking and fire-and-forget', async () => {
  const results: string[] = [];

  const actions: ActionHooks = {
    create: async () => {
      results.push('blocking-create');
    },
    update: {
      handler: async () => {
        results.push('fire-and-forget-update');
      },
      blocking: false,
    },
  };

  // Simulate execution with blocking handling
  const executeAction = async (hook: ActionHook | undefined) => {
    if (!hook) return;
    const handler = typeof hook === 'function' ? hook : hook.handler;
    const isBlocking = typeof hook === 'function' || hook.blocking !== false;

    if (!isBlocking) {
      // Fire and forget - don't await
      handler({} as ActionContext);
    } else {
      // Blocking - await
      await handler({} as ActionContext);
    }
  };

  await executeAction(actions.create);
  await executeAction(actions.update);

  // Both should have run (fire-and-forget still runs, just doesn't block)
  // Small delay to let fire-and-forget complete
  await new Promise((r) => setTimeout(r, 10));
  assertEquals(results.includes('blocking-create'), true);
  assertEquals(results.includes('fire-and-forget-update'), true);
});

// ─────────────────────────────────────────────────────────────
// Filter function tests
// ─────────────────────────────────────────────────────────────

Deno.test('FilterContext: contains hookType, table, action', () => {
  const ctx: FilterContext = {
    hookType: 'action',
    table: 'posts',
    action: 'create',
  };
  assertEquals(ctx.hookType, 'action');
  assertEquals(ctx.table, 'posts');
  assertEquals(ctx.action, 'create');
  assertEquals(ctx.user, undefined);
});

Deno.test('FilterContext: with user info', () => {
  const ctx: FilterContext = {
    hookType: 'transform:beforeSave',
    table: 'users',
    action: 'update',
    user: { sub: 'user-123', role: 'admin' },
  };
  assertEquals(ctx.user?.sub, 'user-123');
  assertEquals(ctx.user?.role, 'admin');
});

Deno.test('HookType: all valid values', () => {
  const hookTypes: HookType[] = [
    'transform:beforeSave',
    'transform:afterRead',
    'action',
  ];
  assertEquals(hookTypes.length, 3);
});

Deno.test('PluginFilter: filter by hookType', () => {
  const filter: PluginFilter = (ctx) => ctx.hookType === 'action';

  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'create' }),
    true,
  );
  assertEquals(
    filter({
      hookType: 'transform:beforeSave',
      table: 'posts',
      action: 'create',
    }),
    false,
  );
  assertEquals(
    filter({ hookType: 'transform:afterRead', table: 'posts', action: 'read' }),
    false,
  );
});

Deno.test('PluginFilter: filter by table', () => {
  const filter: PluginFilter = (ctx) => ctx.table !== 'sessions';

  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'create' }),
    true,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'sessions', action: 'create' }),
    false,
  );
});

Deno.test('PluginFilter: filter by action', () => {
  const filter: PluginFilter = (ctx) =>
    ['create', 'update', 'delete'].includes(ctx.action);

  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'create' }),
    true,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'update' }),
    true,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'delete' }),
    true,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'read' }),
    false,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'list' }),
    false,
  );
});

Deno.test('PluginFilter: filter by user role', () => {
  const filter: PluginFilter = (ctx) => ctx.user?.role !== 'admin';

  assertEquals(
    filter({
      hookType: 'action',
      table: 'posts',
      action: 'create',
      user: { sub: '1', role: 'user' },
    }),
    true,
  );
  assertEquals(
    filter({
      hookType: 'action',
      table: 'posts',
      action: 'create',
      user: { sub: '2', role: 'admin' },
    }),
    false,
  );
  assertEquals(
    filter({ hookType: 'action', table: 'posts', action: 'create' }),
    true,
  ); // no user = include
});

Deno.test('PluginFilter: combined conditions', () => {
  // Only audit create/update/delete actions, skip admin users, skip sessions table
  const filter: PluginFilter = (ctx) =>
    ctx.hookType === 'action' &&
    ['create', 'update', 'delete'].includes(ctx.action) &&
    ctx.table !== 'sessions' &&
    ctx.user?.role !== 'admin';

  assertEquals(
    filter({
      hookType: 'action',
      table: 'posts',
      action: 'create',
      user: { sub: '1', role: 'user' },
    }),
    true,
  );
  assertEquals(
    filter({
      hookType: 'action',
      table: 'posts',
      action: 'read',
      user: { sub: '1', role: 'user' },
    }),
    false,
  );
  assertEquals(
    filter({
      hookType: 'action',
      table: 'sessions',
      action: 'create',
      user: { sub: '1', role: 'user' },
    }),
    false,
  );
  assertEquals(
    filter({
      hookType: 'action',
      table: 'posts',
      action: 'create',
      user: { sub: '1', role: 'admin' },
    }),
    false,
  );
  assertEquals(
    filter({
      hookType: 'transform:beforeSave',
      table: 'posts',
      action: 'create',
      user: { sub: '1', role: 'user' },
    }),
    false,
  );
});

Deno.test('Plugin: with filter function', () => {
  const plugin: PluginConfig = {
    name: 'audit-log',
    filter: (ctx) =>
      ctx.hookType === 'action' &&
      ['create', 'update', 'delete'].includes(ctx.action),
    config: { webhookUrl: 'https://example.com' },
  };

  assertEquals(plugin.name, 'audit-log');
  assertEquals(typeof plugin.filter, 'function');
  // Type guard: filter is a function in this test
  const filterFn = plugin.filter as (ctx: FilterContext) => boolean;
  assertEquals(
    filterFn({ hookType: 'action', table: 'posts', action: 'create' }),
    true,
  );
  assertEquals(
    filterFn({ hookType: 'action', table: 'posts', action: 'read' }),
    false,
  );
});

Deno.test('Plugin: filter replaces stub hooks for Worker filtering', () => {
  // Old pattern (stub hooks for filtering):
  // const oldPlugin: PluginConfig = {
  //   name: 'audit',
  //   worker: someWorker,
  //   hooks: { on: { create: async () => {}, update: async () => {}, delete: async () => {} } },
  // };

  // New pattern (filter function):
  const newPlugin: PluginConfig = {
    name: 'audit',
    // worker: someWorker,
    filter: (ctx) =>
      ctx.hookType === 'action' &&
      ['create', 'update', 'delete'].includes(ctx.action),
  };

  assertEquals(
    (newPlugin.filter as (ctx: FilterContext) => boolean)({
      hookType: 'action',
      table: 'posts',
      action: 'create',
    }),
    true,
  );
  assertEquals(
    (newPlugin.filter as (ctx: FilterContext) => boolean)({
      hookType: 'action',
      table: 'posts',
      action: 'list',
    }),
    false,
  );
  assertEquals(
    (newPlugin.filter as (ctx: FilterContext) => boolean)({
      hookType: 'transform:beforeSave',
      table: 'posts',
      action: 'create',
    }),
    false,
  );
});
