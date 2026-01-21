// Worker setup - worker process side

import type { Plugin, PluginHooks } from '@drizzle-cms/handlers';
import type { WorkerMessage, WorkerResponse } from './types.ts';

/**
 * Set up plugin execution in a worker context
 * 
 * This should be called in the worker file to handle incoming hook execution requests.
 * 
 * @example
 * ```typescript
 * // audit-worker.ts
 * import { createAuditLogPlugin } from '@drizzle-cms/handlers';
 * import { setupWorkerPlugin } from '@drizzle-cms/handlers-workers/worker';
 * 
 * const plugin = createAuditLogPlugin({
 *   // configuration
 * });
 * 
 * setupWorkerPlugin(plugin);
 * ```
 */
export function setupWorkerPlugin(plugin: Plugin): void {
  // Detect if we're in a worker context
  const isDenoWorker = typeof self !== 'undefined' && 'onmessage' in self;
  const isNodeWorker = typeof process !== 'undefined' && 'parentPort' in (process as any);

  if (!isDenoWorker && !isNodeWorker) {
    throw new Error(
      'setupWorkerPlugin must be called in a worker context (Deno Worker or Node.js worker_threads)'
    );
  }

  // Handle messages
  if (isDenoWorker) {
    setupDenoWorker(plugin);
  } else if (isNodeWorker) {
    setupNodeWorker(plugin);
  }
}

/**
 * Set up Deno Worker message handling
 */
function setupDenoWorker(plugin: Plugin): void {
  self.onmessage = async (event: MessageEvent) => {
    const message = event.data as WorkerMessage;
    const response = await executePluginHook(plugin, message);
    self.postMessage(response);
  };
}

/**
 * Set up Node.js Worker message handling
 */
function setupNodeWorker(plugin: Plugin): void {
  // @ts-ignore - Node.js specific
  const { parentPort } = require('worker_threads');
  
  if (!parentPort) {
    throw new Error('parentPort not available in worker_threads');
  }

  parentPort.on('message', async (message: WorkerMessage) => {
    const response = await executePluginHook(plugin, message);
    parentPort.postMessage(response);
  });
}

/**
 * Execute a plugin hook and return the result
 */
async function executePluginHook(
  plugin: Plugin,
  message: WorkerMessage
): Promise<WorkerResponse> {
  const { id, hook, context } = message;

  try {
    // Get the hook function
    const hookFn = plugin.hooks[hook];
    
    if (!hookFn) {
      return {
        id,
        success: false,
        error: `Plugin ${plugin.name} does not implement ${hook} hook`,
      };
    }

    // Execute the hook
    await hookFn(context as any);

    return {
      id,
      success: true,
    };
  } catch (error) {
    return {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
