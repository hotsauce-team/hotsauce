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
 *
 * For Worker plugins, `hooks` may be a declarative declaration (arrays)
 * rather than actual functions. The executor handles both patterns.
 */
export interface PluginConfig {
  name: string;
  description?: string;
  worker?: Worker;
  /**
   * For Worker plugins: declarative arrays like { on: ['create', 'update'] }
   * For in-process plugins: actual functions like { on: { create: fn } }
   */
  hooks?: PluginHooks | WorkerHookDeclaration;
  capabilities?: PluginCapabilities;
  config?: object;
}

/**
 * Declarative hook names for Worker plugins.
 * Worker plugins declare which hooks they handle; the actual functions
 * live in the Worker module, not in the main thread config.
 */
export interface WorkerHookDeclaration {
  transform?: ('beforeSave' | 'afterRead')[];
  on?: ('create' | 'read' | 'update' | 'delete' | 'list')[];
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
 * Context for plugin error reporting
 */
export interface PluginErrorContext {
  /** Plugin name that failed */
  plugin: string;
  /** Type of operation that failed */
  operation: 'init' | 'transform:beforeSave' | 'transform:afterRead' | 'action';
  /** CRUD action (for action hooks) */
  action?: CrudAction;
}

/**
 * Error handler callback for plugin failures
 */
export type PluginErrorHandler = (
  error: Error,
  context: PluginErrorContext,
) => void;

/**
 * Manages Worker instances for plugins.
 * Users provide their own Worker instances for full control over permissions.
 */
export class WorkerExecutor {
  private workers: Map<string, Worker> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: Serializable) => void;
    reject: (error: Error) => void;
    context: PluginErrorContext;
  }> = new Map();
  private messageIdCounter = 0;
  private onError?: PluginErrorHandler;

  constructor(onError?: PluginErrorHandler) {
    this.onError = onError;
  }

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

    // SECURITY: Log Worker errors but don't expose details
    // Prevents credential leakage via error messages
    worker.onerror = (event: ErrorEvent) => {
      console.error(`[plugin:${plugin.name}] Worker error (details hidden)`);
      // Prevent default which might expose error details
      event.preventDefault();
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

      if (isWorker) {
        // Send to Worker (declarative hooks - Worker handles internally)
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
      } else {
        // Execute in-process hook (function form)
        const hook = this.getInProcessTransformHook(plugin.hooks, 'beforeSave');
        if (hook) {
          result = await hook(ctx, result);
        }
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

      if (isWorker) {
        // Send to Worker (declarative hooks - Worker handles internally)
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
      } else {
        // Execute in-process hook (function form)
        const hook = this.getInProcessTransformHook(plugin.hooks, 'afterRead');
        if (hook) {
          result = await hook(ctx, result);
        }
      }
    }

    return result;
  }

  /**
   * Get a transform hook from in-process plugin hooks (function form)
   */
  private getInProcessTransformHook(
    hooks: PluginConfig['hooks'],
    hookName: 'beforeSave' | 'afterRead',
  ):
    | ((
      ctx: PluginContext,
      data: Record<string, Serializable>,
    ) => Promise<Record<string, Serializable>> | Record<string, Serializable>)
    | undefined {
    if (!hooks) return undefined;
    // Check if it's in-process hooks (object with functions, not array)
    const transformHooks = hooks.transform;
    if (!transformHooks || Array.isArray(transformHooks)) return undefined;
    return (transformHooks as Record<
      string,
      (
        ctx: PluginContext,
        data: Record<string, Serializable>,
      ) => Promise<Record<string, Serializable>> | Record<string, Serializable>
    >)[hookName];
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

      if (isWorker) {
        // Worker plugins: declarative hooks (arrays)
        // Workers default to fire-and-forget unless capabilities say otherwise
        const promise = this.executeActionHook(plugin.name, action, ctx);

        // Fire-and-forget: errors handled via onError callback in handleWorkerResponse
        fireAndForgetPromises.push(promise.catch(() => {}));
      } else {
        // In-process plugins: function hooks
        const hook = this.getInProcessActionHook(plugin.hooks, action);

        if (hook) {
          const isFireAndForget = this.isFireAndForget(hook);
          const handler = typeof hook === 'function' ? hook : hook.handler;

          const promise = Promise.resolve(handler(ctx)).then(() => {});

          if (isFireAndForget) {
            fireAndForgetPromises.push(
              promise.catch((error) => {
                // In-process plugins: call onError with full error (user's own code)
                const err = error instanceof Error
                  ? error
                  : new Error(String(error));
                this.onError?.(err, {
                  plugin: plugin.name,
                  operation: 'action',
                  action,
                });
              }),
            );
          } else {
            blockingPromises.push(promise);
          }
        }
      }
    }

    // Wait for blocking hooks
    await Promise.allSettled(blockingPromises);

    // Fire-and-forget hooks run in background (not awaited)
  }

  /**
   * Get an action hook from in-process plugin hooks (function form)
   */
  private getInProcessActionHook(
    hooks: PluginConfig['hooks'],
    action: CrudAction,
  ): ActionHook | undefined {
    if (!hooks) return undefined;
    // Check if it's in-process hooks (object with functions, not array)
    const onHooks = hooks.on;
    if (!onHooks || Array.isArray(onHooks)) return undefined;
    return (onHooks as Record<string, ActionHook>)[action];
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
      action,
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
    action?: CrudAction,
  ): Promise<Serializable> {
    const worker = this.workers.get(pluginName);
    if (!worker) {
      return Promise.reject(new Error(`No worker for plugin: ${pluginName}`));
    }

    const id = `${pluginName}-${++this.messageIdCounter}`;

    // Build error context for this request
    const context: PluginErrorContext = {
      plugin: pluginName,
      operation: type === 'init'
        ? 'init'
        : type as PluginErrorContext['operation'],
      action,
    };

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        const error = new Error(`Plugin ${pluginName} timed out on ${type}`);
        this.onError?.(error, context);
        reject(error);
      }, 30000); // 30 second timeout

      // Store pending request with context
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        context,
      });

      // Send message
      const message: WorkerRequest = { id, type, payload };
      worker.postMessage(message);
    });
  }

  /**
   * Handle response from Worker.
   *
   * SECURITY: Worker error messages are passed to onError for logging
   * but NOT propagated in the thrown error. This prevents plugins from
   * leaking credentials or sensitive data via error messages to end users.
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
      // Create error with FULL message for onError callback
      const fullError = new Error(response.error ?? 'Unknown plugin error');

      // Call onError with full error details for server-side logging
      this.onError?.(fullError, pending.context);

      // Return sanitized error - never expose Worker error messages externally
      // This prevents credential leakage via error messages
      pending.reject(
        new Error(`Plugin "${pending.context.plugin}" execution failed`),
      );
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
