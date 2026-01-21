// Worker plugin wrapper - main process side

import type { Plugin, PluginHooks, BeforeContext, AfterContext, PluginContext } from '@drizzle-cms/handlers';
import type { WorkerPluginOptions, WorkerMessage, WorkerResponse, Runtime } from './types.ts';
import { detectRuntime, getRuntimeName } from './runtime.ts';

/**
 * Create a worker-isolated plugin wrapper
 * 
 * This wraps an existing plugin to run in a separate worker process for isolation.
 * The worker handles all hook execution with IPC message passing.
 */
export function createWorkerPlugin(options: WorkerPluginOptions): Plugin {
  const runtime = detectRuntime();
  
  if (runtime === 'unknown') {
    throw new Error(
      'Worker-based plugins require Deno or Node.js. ' +
      'Current runtime is not supported.'
    );
  }

  // Create the worker instance
  const worker = createWorker(runtime, options);
  
  // Generate unique IDs for messages
  let messageId = 0;
  const pendingMessages = new Map<string, {
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }>();

  // Handle messages from worker
  worker.onMessage((response: WorkerResponse) => {
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
  });

  // Send hook execution to worker
  async function executeHook(hook: keyof PluginHooks, context: unknown): Promise<void> {
    const id = `msg-${++messageId}`;
    const message: WorkerMessage = { id, hook, context };

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
  function executeHookAsync(hook: keyof PluginHooks, context: unknown): void {
    const id = `msg-${++messageId}`;
    const message: WorkerMessage = { id, hook, context };
    
    // Send without waiting for response
    worker.postMessage(message);
    
    // Log errors if they occur
    const pending = new Promise<void>((resolve, reject) => {
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

  // Build the plugin wrapper
  const hooks: PluginHooks = {};

  // Before hooks - synchronous (must wait for validation)
  if (options.plugin.hooks.beforeCreate) {
    hooks.beforeCreate = (ctx: BeforeContext) => executeHook('beforeCreate', ctx);
  }
  if (options.plugin.hooks.beforeUpdate) {
    hooks.beforeUpdate = (ctx: BeforeContext) => executeHook('beforeUpdate', ctx);
  }
  if (options.plugin.hooks.beforeDelete) {
    hooks.beforeDelete = (ctx: AfterContext) => executeHook('beforeDelete', ctx);
  }
  if (options.plugin.hooks.beforeRead) {
    hooks.beforeRead = (ctx: PluginContext & { recordId: string }) => 
      executeHook('beforeRead', ctx);
  }
  if (options.plugin.hooks.beforeList) {
    hooks.beforeList = (ctx: PluginContext) => executeHook('beforeList', ctx);
  }

  // After hooks - fire-and-forget (don't block response)
  if (options.plugin.hooks.afterCreate) {
    hooks.afterCreate = (ctx: AfterContext) => {
      executeHookAsync('afterCreate', ctx);
    };
  }
  if (options.plugin.hooks.afterUpdate) {
    hooks.afterUpdate = (ctx: AfterContext) => {
      executeHookAsync('afterUpdate', ctx);
    };
  }
  if (options.plugin.hooks.afterDelete) {
    hooks.afterDelete = (ctx: AfterContext) => {
      executeHookAsync('afterDelete', ctx);
    };
  }
  if (options.plugin.hooks.afterRead) {
    hooks.afterRead = (ctx: AfterContext) => {
      executeHookAsync('afterRead', ctx);
    };
  }
  if (options.plugin.hooks.afterList) {
    hooks.afterList = (ctx: PluginContext & { records: Record<string, unknown>[] }) => {
      executeHookAsync('afterList', ctx);
    };
  }

  return {
    name: `${options.plugin.name} (worker-isolated)`,
    hooks,
  };
}

/**
 * Worker abstraction interface
 */
interface WorkerInterface {
  postMessage(message: WorkerMessage): void;
  onMessage(handler: (response: WorkerResponse) => void): void;
  terminate(): void;
}

/**
 * Create a worker instance for the detected runtime
 */
function createWorker(runtime: Runtime, options: WorkerPluginOptions): WorkerInterface {
  if (runtime === 'deno') {
    return createDenoWorker(options);
  } else if (runtime === 'node') {
    return createNodeWorker(options);
  }
  
  throw new Error(`Unsupported runtime: ${runtime}`);
}

/**
 * Create a Deno Worker
 */
function createDenoWorker(options: WorkerPluginOptions): WorkerInterface {
  // @ts-ignore - Deno global
  const DenoWorker = Deno?.Worker;
  if (!DenoWorker) {
    throw new Error('Deno Worker API not available');
  }

  const workerUrl = typeof options.workerUrl === 'string' 
    ? new URL(options.workerUrl, import.meta.url)
    : options.workerUrl;

  const worker = new DenoWorker(workerUrl.href, {
    type: 'module',
    // @ts-ignore - Deno-specific options
    deno: {
      permissions: options.permissions || {
        read: false,
        write: false,
        net: false,
        env: false,
        run: false,
      },
    },
  });

  return {
    postMessage: (message: WorkerMessage) => worker.postMessage(message),
    onMessage: (handler: (response: WorkerResponse) => void) => {
      worker.onmessage = (event: MessageEvent) => handler(event.data);
    },
    terminate: () => worker.terminate(),
  };
}

/**
 * Create a Node.js Worker
 */
function createNodeWorker(options: WorkerPluginOptions): WorkerInterface {
  // Dynamic import to avoid errors in Deno
  // @ts-ignore - Node.js specific
  const { Worker } = require('worker_threads');

  const workerUrl = typeof options.workerUrl === 'string'
    ? options.workerUrl
    : options.workerUrl.pathname;

  const worker = new Worker(workerUrl, {
    // Node.js doesn't support module workers the same way
    // Users need to ensure their worker file is compatible
  });

  return {
    postMessage: (message: WorkerMessage) => worker.postMessage(message),
    onMessage: (handler: (response: WorkerResponse) => void) => {
      worker.on('message', (data: WorkerResponse) => handler(data));
    },
    terminate: () => worker.terminate(),
  };
}
