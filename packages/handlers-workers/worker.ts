// Worker setup - worker process side

import type { Plugin } from '@drizzle-cms/handlers';
import type { WorkerMessage, WorkerResponse } from './types.ts';

/**
 * Plugin factory function type - creates plugin with config from message
 */
export type PluginFactory<TConfig = unknown> = (config?: TConfig) => Plugin;

/**
 * Set up plugin execution in a worker context with a plugin factory
 * 
 * The factory receives config from each message, allowing dynamic configuration.
 * 
 * @example
 * ```typescript
 * // audit-worker.ts
 * import { createAuditLogPlugin } from '@drizzle-cms/plugins';
 * import { setupWorkerPlugin } from '@drizzle-cms/handlers-workers/worker';
 * 
 * setupWorkerPlugin((config) => 
 *   createAuditLogPlugin({ ...config, db })
 * );
 * ```
 */
export function setupWorkerPlugin<TConfig = unknown>(
  pluginFactory: PluginFactory<TConfig>
): void {
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
    setupDenoWorker(pluginFactory);
  } else if (isNodeWorker) {
    setupNodeWorker(pluginFactory);
  }
}

/**
 * Set up Deno Worker message handling
 */
function setupDenoWorker<TConfig>(pluginFactory: PluginFactory<TConfig>): void {
  // @ts-ignore: Worker context has onmessage
  self.onmessage = async (event: MessageEvent) => {
    const message = event.data as WorkerMessage<TConfig>;
    const response = await executePluginHook(pluginFactory, message);
    // @ts-ignore: Worker context has postMessage
    self.postMessage(response);
  };
}

/**
 * Set up Node.js Worker message handling
 */
function setupNodeWorker<TConfig>(pluginFactory: PluginFactory<TConfig>): void {
  // @ts-ignore - Node.js specific
  const { parentPort } = require('worker_threads');
  
  if (!parentPort) {
    throw new Error('parentPort not available in worker_threads');
  }

  parentPort.on('message', async (message: WorkerMessage<TConfig>) => {
    const response = await executePluginHook(pluginFactory, message);
    parentPort.postMessage(response);
  });
}

/**
 * Execute a plugin hook and return the result
 */
async function executePluginHook<TConfig>(
  pluginFactory: PluginFactory<TConfig>,
  message: WorkerMessage<TConfig>
): Promise<WorkerResponse> {
  const { id, hook, context, config } = message;

  try {
    // Create plugin instance with config from message
    const plugin = pluginFactory(config);
    
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
