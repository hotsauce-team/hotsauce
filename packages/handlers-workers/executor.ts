// Worker executor
// Manages Worker instances for plugin isolation
// Compatible with Deno and Node.js 20+

import type {
  ActionContext,
  ActionHook,
  ActionHookConfig,
  CrudAction,
  PluginContext,
  PluginHooks,
  PluginRequest,
  PluginResponse,
  Serializable,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Worker message protocol
// ─────────────────────────────────────────────────────────────

/**
 * Message types for Worker communication
 */
type WorkerMessageType =
  | 'init'
  | 'transform:beforeSave'
  | 'transform:afterRead'
  | 'action'
  | 'route';

/**
 * Message sent to Worker
 */
interface WorkerRequest {
  id: string;
  type: WorkerMessageType;
  payload: Serializable;
}

/**
 * Response from Worker
 */
interface WorkerResponse {
  id: string;
  success: boolean;
  result?: Serializable;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Plugin registration types
// ─────────────────────────────────────────────────────────────

/**
 * Plugin capabilities declaration
 */
export interface PluginCapabilities {
  network?: string[];
  transforms?: ('beforeSave' | 'afterRead')[];
  actions?: ('create' | 'read' | 'update' | 'delete' | 'list')[];
  routes?: string[];
}

/**
 * Plugin configuration (flat structure).
 * Note: The full PluginConfig in handlers/plugins/types.ts also has `filter`.
 * This simplified version is used by the executor which doesn't need filter.
 */
export interface PluginConfig {
  name: string;
  description?: string;
  worker?: Worker;
  hooks?: PluginHooks;
  capabilities?: PluginCapabilities;
  config?: object;
}

/**
 * A registered plugin with its initialization state
 */
export interface RegisteredPlugin {
  plugin: PluginConfig;
  initialized: boolean;
  /** Whether this plugin runs in a Worker */
  isWorker: boolean;
}

// ─────────────────────────────────────────────────────────────
// Worker pool management
// ─────────────────────────────────────────────────────────────

/**
 * Manages Worker instances for plugins.
 * Users provide their own Worker instances for full control over permissions.
 */
export class WorkerExecutor {
  private workers: Map<string, Worker> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: Serializable) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private messageIdCounter = 0;

  /**
   * Initialize a Worker for a plugin.
   * Plugin must have a Worker instance provided.
   */
  async initPlugin(registered: RegisteredPlugin): Promise<void> {
    const { plugin, isWorker } = registered;

    // In-process plugins don't need Worker initialization
    if (!isWorker) {
      registered.initialized = true;
      return;
    }

    const { worker, config } = plugin;

    if (!worker) {
      throw new Error(
        `Plugin "${plugin.name}" marked as Worker plugin but has no Worker instance. ` +
          `Create one with: new Worker(import.meta.resolve('...'), { type: 'module' })`,
      );
    }

    if (this.workers.has(plugin.name)) {
      throw new Error(`Worker already initialized for plugin: ${plugin.name}`);
    }

    // Set up message handling
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerResponse(event.data);
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error(`Worker error in plugin ${plugin.name}:`, event.message);
    };

    this.workers.set(plugin.name, worker);

    // Initialize the plugin in the Worker
    await this.sendToWorker(plugin.name, 'init', {
      plugin: this.serializePlugin(plugin),
      config: config as Serializable,
    });

    registered.initialized = true;
  }

  /**
   * Execute beforeSave transform for all plugins
   */
  async executeBeforeSave(
    plugins: RegisteredPlugin[],
    ctx: PluginContext,
    data: Record<string, Serializable>,
  ): Promise<Record<string, Serializable>> {
    let result = data;

    for (const registered of plugins) {
      const { plugin, isWorker } = registered;
      const hook = plugin.hooks?.transform?.beforeSave;

      if (isWorker) {
        // Send to Worker
        const response = await this.sendToWorker(
          plugin.name,
          'transform:beforeSave',
          {
            ctx,
            data: result,
          } as unknown as Serializable,
        );

        if (
          response && typeof response === 'object' && !Array.isArray(response)
        ) {
          result = response as Record<string, Serializable>;
        }
      } else if (hook) {
        // Execute in-process
        result = await hook(ctx, result);
      }
    }

    return result;
  }

  /**
   * Execute afterRead transform for all plugins
   */
  async executeAfterRead(
    plugins: RegisteredPlugin[],
    ctx: PluginContext,
    data: Record<string, Serializable>,
  ): Promise<Record<string, Serializable>> {
    let result = data;

    for (const registered of plugins) {
      const { plugin, isWorker } = registered;
      const hook = plugin.hooks?.transform?.afterRead;

      if (isWorker) {
        // Send to Worker
        const response = await this.sendToWorker(
          plugin.name,
          'transform:afterRead',
          {
            ctx,
            data: result,
          } as unknown as Serializable,
        );

        if (
          response && typeof response === 'object' && !Array.isArray(response)
        ) {
          result = response as Record<string, Serializable>;
        }
      } else if (hook) {
        // Execute in-process
        result = await hook(ctx, result);
      }
    }

    return result;
  }

  /**
   * Execute action hooks for a specific CRUD action.
   * Respects fireAndForget configuration per hook.
   */
  async executeAction(
    plugins: RegisteredPlugin[],
    action: CrudAction,
    ctx: ActionContext,
  ): Promise<void> {
    const blockingPromises: Promise<void>[] = [];
    const fireAndForgetPromises: Promise<void>[] = [];

    for (const registered of plugins) {
      const { plugin, isWorker } = registered;
      const hook = plugin.hooks?.on?.[action];

      if (isWorker) {
        // Worker plugins: send message, assume fire-and-forget unless hooks say otherwise
        const isFireAndForget = hook ? this.isFireAndForget(hook) : true;

        const promise = this.executeActionHook(plugin.name, action, ctx);

        if (isFireAndForget) {
          fireAndForgetPromises.push(
            promise.catch((error) => {
              console.error(
                `Plugin ${plugin.name} action hook (${action}) failed:`,
                error instanceof Error ? error.message : error,
              );
            }),
          );
        } else {
          blockingPromises.push(promise);
        }
      } else if (hook) {
        // In-process: execute directly
        const isFireAndForget = this.isFireAndForget(hook);
        const handler = typeof hook === 'function' ? hook : hook.handler;

        const promise = Promise.resolve(handler(ctx)).then(() => {});

        if (isFireAndForget) {
          fireAndForgetPromises.push(
            promise.catch((error) => {
              console.error(
                `Plugin ${plugin.name} action hook (${action}) failed:`,
                error instanceof Error ? error.message : error,
              );
            }),
          );
        } else {
          blockingPromises.push(promise);
        }
      }
    }

    // Wait for blocking hooks
    await Promise.allSettled(blockingPromises);

    // Fire-and-forget hooks run in background (not awaited)
  }

  /**
   * Check if an action hook is configured as fire-and-forget
   */
  private isFireAndForget(hook: ActionHook): boolean {
    if (typeof hook === 'function') {
      return false; // Simple function form defaults to blocking
    }
    return (hook as ActionHookConfig).fireAndForget === true;
  }

  /**
   * Execute a single action hook
   */
  private async executeActionHook(
    pluginName: string,
    action: CrudAction,
    ctx: ActionContext,
  ): Promise<void> {
    await this.sendToWorker(
      pluginName,
      'action',
      { action, ctx } as unknown as Serializable,
    );
  }

  /**
   * Execute a plugin route handler
   */
  async executeRoute(
    pluginName: string,
    routePath: string,
    request: PluginRequest,
  ): Promise<PluginResponse> {
    const response = await this.sendToWorker(pluginName, 'route', {
      path: routePath,
      request,
    } as unknown as Serializable);

    if (response && typeof response === 'object' && 'status' in response) {
      return response as unknown as PluginResponse;
    }

    return { status: 500, body: { error: 'Invalid route response' } };
  }

  /**
   * Terminate all Workers
   */
  terminate(): void {
    for (const [name, worker] of this.workers) {
      worker.terminate();
      this.workers.delete(name);
    }
  }

  /**
   * Terminate a specific plugin's Worker
   */
  terminatePlugin(pluginName: string): void {
    const worker = this.workers.get(pluginName);
    if (worker) {
      worker.terminate();
      this.workers.delete(pluginName);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a message to a plugin's Worker and wait for response
   */
  private sendToWorker(
    pluginName: string,
    type: WorkerMessageType,
    payload: Serializable,
  ): Promise<Serializable> {
    const worker = this.workers.get(pluginName);
    if (!worker) {
      return Promise.reject(new Error(`No worker for plugin: ${pluginName}`));
    }

    const id = `${pluginName}-${++this.messageIdCounter}`;

    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Plugin ${pluginName} timed out on ${type}`));
      }, 30000); // 30 second timeout

      // Clear timeout when resolved
      const originalResolve = resolve;
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      // Send message
      const message: WorkerRequest = { id, type, payload };
      worker.postMessage(message);
    });
  }

  /**
   * Handle response from Worker
   */
  private handleWorkerResponse(response: WorkerResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn(`Received response for unknown request: ${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.success) {
      pending.resolve(response.result ?? null);
    } else {
      pending.reject(new Error(response.error ?? 'Unknown plugin error'));
    }
  }

  /**
   * Serialize a plugin definition for sending to Worker
   */
  private serializePlugin(plugin: PluginConfig): Serializable {
    const capabilities: Serializable | undefined = plugin.capabilities
      ? {
        network: plugin.capabilities.network,
        transforms: plugin.capabilities.transforms,
        actions: plugin.capabilities.actions,
        routes: plugin.capabilities.routes,
      }
      : undefined;

    return {
      name: plugin.name,
      description: plugin.description,
      capabilities,
    };
  }
}

/**
 * Create a Worker executor instance
 */
export function createWorkerExecutor(): WorkerExecutor {
  return new WorkerExecutor();
}
