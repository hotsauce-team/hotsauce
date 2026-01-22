// Worker plugin wrapper - main process side

import type { Plugin, PluginHooks, BeforeContext, AfterContext, PluginContext } from '@drizzle-cms/handlers';
import type { WorkerPluginOptions, WorkerMessage, WorkerResponse, FilterContext } from './types.ts';

/**
 * Create a worker-isolated plugin wrapper
 * 
 * User creates the Worker instance with appropriate permissions, then passes it here.
 * This wrapper handles IPC communication and hook execution filtering.
 * 
 * @example
 * ```ts
 * // Create worker with Deno permissions
 * const worker = new Worker(new URL('./plugin.ts', import.meta.url), {
 *   type: 'module',
 *   deno: { permissions: { write: ['./logs'] } }
 * });
 * 
 * // Create plugin
 * const plugin = createWorkerPlugin(worker, {
 *   config: { logFullRecord: true },
 *   filter: (ctx) => ['afterCreate', 'afterUpdate'].includes(ctx.hook)
 * });
 * ```
 */
export function createWorkerPlugin<TConfig = unknown>(
  worker: Worker,
  options: WorkerPluginOptions<TConfig> = {}
): Plugin {
  
  // Generate unique IDs for messages
  let messageId = 0;
  const pendingMessages = new Map<string, {
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }>();

  // Handle messages from worker
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const pending = pendingMessages.get(response.id);
    if (!pending) {
      console.error(`[Worker] Received response for unknown message ${response.id}`);
      return;
    }

    pendingMessages.delete(response.id);

    if (response.success) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.error || 'Worker execution failed'));
    }
  };

  // Check if hook should be executed based on filter
  function shouldExecute(hook: keyof PluginHooks, context: FilterContext): boolean {
    if (!options.filter) return true;
    return options.filter({ ...context, hook });
  }

  // Send hook execution to worker
  async function executeHook(hook: keyof PluginHooks, context: FilterContext): Promise<void> {
    // Apply filter
    if (!shouldExecute(hook, context)) {
      return; // Skip execution
    }

    const id = `msg-${++messageId}`;
    const message: WorkerMessage<TConfig> = { 
      id, 
      hook, 
      context,
      config: options.config
    };

    const promise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingMessages.delete(id);
        reject(new Error(`Worker timeout executing ${hook}`));
      }, options.timeout || 30000);

      pendingMessages.set(id, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });

    worker.postMessage(message);
    return promise;
  }

  // Fire-and-forget for after hooks
  function executeHookAsync(hook: keyof PluginHooks, context: FilterContext): void {
    // Apply filter
    if (!shouldExecute(hook, context)) {
      return; // Skip execution
    }

    const id = `msg-${++messageId}`;
    const message: WorkerMessage<TConfig> = { 
      id, 
      hook, 
      context,
      config: options.config
    };
    
    // Send without waiting for response
    worker.postMessage(message);
    
    // Log errors if they occur (but don't await - fire and forget)
    new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingMessages.delete(id);
        resolve(); // Don't fail on timeout for async hooks
      }, options.timeout || 30000);

      pendingMessages.set(id, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          console.error(`[Worker] Async hook ${hook} failed:`, error);
          resolve(); // Don't propagate async errors
        },
      });
    });
  }

  // Build the plugin wrapper - register all hooks
  const hooks: PluginHooks = {};

  // Before hooks - synchronous (must wait for validation)
  hooks.beforeCreate = (ctx: BeforeContext) => 
    executeHook('beforeCreate', { ...ctx, data: ctx.data });
  
  hooks.beforeUpdate = (ctx: BeforeContext) => 
    executeHook('beforeUpdate', { ...ctx, data: ctx.data });
  
  hooks.beforeDelete = (ctx: AfterContext) => 
    executeHook('beforeDelete', { ...ctx, record: ctx.record });
  
  hooks.beforeRead = (ctx: PluginContext & { recordId: string }) => 
    executeHook('beforeRead', { ...ctx, recordId: ctx.recordId });
  
  hooks.beforeList = (ctx: PluginContext) => 
    executeHook('beforeList', ctx);

  // After hooks - fire-and-forget (don't block response)
  hooks.afterCreate = (ctx: AfterContext) => {
    executeHookAsync('afterCreate', { ...ctx, record: ctx.record });
  };
  
  hooks.afterUpdate = (ctx: AfterContext) => {
    executeHookAsync('afterUpdate', { ...ctx, record: ctx.record });
  };
  
  hooks.afterDelete = (ctx: AfterContext) => {
    executeHookAsync('afterDelete', { ...ctx, record: ctx.record });
  };
  
  hooks.afterRead = (ctx: AfterContext) => {
    executeHookAsync('afterRead', { ...ctx, record: ctx.record });
  };
  
  hooks.afterList = (ctx: PluginContext & { records: Record<string, unknown>[] }) => {
    executeHookAsync('afterList', { ...ctx, records: ctx.records });
  };

  return {
    name: 'worker-isolated-plugin',
    hooks,
  };
}
