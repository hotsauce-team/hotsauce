// Plugin types tests - validates type constraints and helpers

import { assertEquals } from 'jsr:@std/assert';
import type {
  Plugin,
  PluginContext,
  ActionContext,
  Serializable,
  ActionHook,
  ActionHookConfig,
  TransformHooks,
  ActionHooks,
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

Deno.test('ActionHook: config form with fireAndForget', () => {
  const hook: ActionHook = {
    handler: async (_ctx) => {},
    fireAndForget: true,
  };
  assertEquals(typeof hook, 'object');
  assertEquals((hook as ActionHookConfig).fireAndForget, true);
});

Deno.test('ActionHook: config form blocking', () => {
  const hook: ActionHook = {
    handler: async (_ctx) => {},
    fireAndForget: false,
  };
  assertEquals((hook as ActionHookConfig).fireAndForget, false);
});

// Helper to check if hook is fire-and-forget
function isFireAndForget(hook: ActionHook): boolean {
  if (typeof hook === 'function') return false;
  return hook.fireAndForget === true;
}

Deno.test('ActionHook: isFireAndForget helper', () => {
  const blockingFn: ActionHook = async () => {};
  const blockingConfig: ActionHook = { handler: async () => {}, fireAndForget: false };
  const fireAndForget: ActionHook = { handler: async () => {}, fireAndForget: true };

  assertEquals(isFireAndForget(blockingFn), false);
  assertEquals(isFireAndForget(blockingConfig), false);
  assertEquals(isFireAndForget(fireAndForget), true);
});

// ─────────────────────────────────────────────────────────────
// Plugin definition tests
// ─────────────────────────────────────────────────────────────

Deno.test('Plugin: minimal definition', () => {
  const plugin: Plugin = {
    name: 'minimal',
  };
  assertEquals(plugin.name, 'minimal');
});

Deno.test('Plugin: with transforms only', () => {
  const plugin: Plugin = {
    name: 'transform-only',
    hooks: {
      transform: {
        beforeSave: async (_ctx, data) => ({ ...data, modified: true }),
      },
    },
  };
  assertEquals(plugin.hooks?.transform?.beforeSave !== undefined, true);
  assertEquals(plugin.hooks?.on, undefined);
});

Deno.test('Plugin: with actions only', () => {
  const plugin: Plugin = {
    name: 'action-only',
    hooks: {
      on: {
        create: async () => {},
        update: { handler: async () => {}, fireAndForget: true },
      },
    },
  };
  assertEquals(plugin.hooks?.on?.create !== undefined, true);
  assertEquals(plugin.hooks?.on?.update !== undefined, true);
  assertEquals(plugin.hooks?.transform, undefined);
});

Deno.test('Plugin: with routes', () => {
  const plugin: Plugin = {
    name: 'with-routes',
    routes: [
      {
        path: '/api/custom',
        method: 'POST',
        handler: async (req) => ({
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
  const plugin: Plugin = {
    name: 'with-caps',
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
  const plugin: Plugin = {
    name: 'audit-logger',
    description: 'Logs all CRUD operations to external service',
    capabilities: {
      actions: ['create', 'update', 'delete'],
      network: ['audit.example.com'],
    },
    hooks: {
      on: {
        create: {
          handler: async (ctx) => {
            // Would send to audit service
            console.log('Created:', ctx.recordId);
          },
          fireAndForget: true,
        },
        update: {
          handler: async (ctx) => {
            console.log('Updated:', ctx.recordId);
          },
          fireAndForget: true,
        },
        delete: {
          handler: async (ctx) => {
            console.log('Deleted:', ctx.recordId);
          },
          fireAndForget: true,
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
  assertEquals((result as Record<string, unknown>).updatedAt !== undefined, true);
});

Deno.test('TransformHooks: afterRead adds computed fields', async () => {
  const transforms: TransformHooks = {
    afterRead: async (_ctx, data) => ({
      ...data,
      fullName: `${data.firstName} ${data.lastName}`,
    }),
  };

  const ctx: PluginContext = { table: 'users', action: 'read' };
  const input = { firstName: 'John', lastName: 'Doe', email: 'john@example.com' };
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

  data = await transform1.beforeSave!(ctx, data) as Record<string, Serializable>;
  data = await transform2.beforeSave!(ctx, data) as Record<string, Serializable>;

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
      fireAndForget: true,
    },
  };

  // Simulate execution with fireAndForget handling
  const executeAction = async (hook: ActionHook | undefined) => {
    if (!hook) return;
    const handler = typeof hook === 'function' ? hook : hook.handler;
    const isAsync = typeof hook !== 'function' && hook.fireAndForget;

    if (isAsync) {
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
