// Worker sandbox executor
// Runs plugin code in isolated Worker threads

import type {
  Plugin,
  PluginContext,
  ActionContext,
  PluginRequest,
  PluginResponse,
  Serializable,
  SandboxMode,
} from './types.ts';
import type { RegisteredPlugin } from './registry.ts';

// ─────────────────────────────────────────────────────────────
// Worker message protocol
// ─────────────────────────────────────────────────────────────

/**
 * Message types for Worker communication
 */
type WorkerMessageType =
  | 'init'
  | 'hook:beforeSave'
  | 'hook:afterRead'
  | 'hook:onAction'
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
// Worker pool management
// ─────────────────────────────────────────────────────────────

/**
 * Manages Worker instances for plugins
 */
export class WorkerExecutor {
  private workers: Map<string, Worker> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: Serializable) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private messageIdCounter = 0;
  private sandboxMode: SandboxMode;

  constructor(sandboxMode: SandboxMode = 'worker') {
    this.sandboxMode = sandboxMode;
  }

  /**
   * Initialize a Worker for a plugin
   */
  async initPlugin(registered: RegisteredPlugin): Promise<void> {
    const { plugin, config } = registered;

    if (this.workers.has(plugin.name)) {
      throw new Error(`Worker already initialized for plugin: ${plugin.name}`);
    }

    // Create worker with appropriate sandbox level
    const worker = await this.createWorker(plugin);

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
      config,
    });

    registered.initialized = true;
  }

  /**
   * Execute beforeSave hook for all plugins
   */
  async executeBeforeSave(
    plugins: RegisteredPlugin[],
    ctx: PluginContext,
    data: Record<string, Serializable>
  ): Promise<Record<string, Serializable>> {
    let result = data;

    for (const { plugin } of plugins) {
      if (!plugin.hooks?.beforeSave) continue;

      const response = await this.sendToWorker(plugin.name, 'hook:beforeSave', {
        ctx,
        data: result,
      });

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        result = response as Record<string, Serializable>;
      }
    }

    return result;
  }

  /**
   * Execute afterRead hook for all plugins
   */
  async executeAfterRead(
    plugins: RegisteredPlugin[],
    ctx: PluginContext,
    data: Record<string, Serializable>
  ): Promise<Record<string, Serializable>> {
    let result = data;

    for (const { plugin } of plugins) {
      if (!plugin.hooks?.afterRead) continue;

      const response = await this.sendToWorker(plugin.name, 'hook:afterRead', {
        ctx,
        data: result,
      });

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        result = response as Record<string, Serializable>;
      }
    }

    return result;
  }

  /**
   * Execute onAction hook for all plugins (fire and forget, errors logged)
   */
  async executeOnAction(
    plugins: RegisteredPlugin[],
    ctx: ActionContext
  ): Promise<void> {
    const promises = plugins
      .filter(({ plugin }) => plugin.hooks?.onAction)
      .map(async ({ plugin }) => {
        try {
          await this.sendToWorker(plugin.name, 'hook:onAction', { ctx });
        } catch (error) {
          console.error(
            `Plugin ${plugin.name} onAction hook failed:`,
            error instanceof Error ? error.message : error
          );
        }
      });

    // Wait for all but don't fail if some error
    await Promise.allSettled(promises);
  }

  /**
   * Execute a plugin route handler
   */
  async executeRoute(
    pluginName: string,
    routePath: string,
    request: PluginRequest
  ): Promise<PluginResponse> {
    const response = await this.sendToWorker(pluginName, 'route', {
      path: routePath,
      request,
    });

    if (response && typeof response === 'object' && 'status' in response) {
      return response as PluginResponse;
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
   * Create a Worker with appropriate sandbox settings
   */
  private async createWorker(plugin: Plugin): Promise<Worker> {
    // Get the worker script URL
    const workerUrl = new URL('./sandbox/worker-script.ts', import.meta.url);

    // Check if we're on Deno and should use enhanced permissions
    const isDeno = typeof globalThis.Deno !== 'undefined';

    if (isDeno && this.sandboxMode === 'deno-sandbox') {
      // Deno Worker with restricted permissions
      return this.createDenoSandboxedWorker(workerUrl, plugin);
    }

    // Standard Worker (works on all runtimes)
    return new Worker(workerUrl, { type: 'module' });
  }

  /**
   * Create a Deno Worker with restricted permissions based on plugin capabilities
   */
  private createDenoSandboxedWorker(workerUrl: URL, plugin: Plugin): Worker {
    // Build permission object from plugin capabilities
    const capabilities = plugin.capabilities ?? {};

    // deno-lint-ignore no-explicit-any
    const denoOptions: any = {
      type: 'module',
      deno: {
        permissions: {
          // No filesystem access
          read: false,
          write: false,

          // No subprocess spawning
          run: false,

          // No FFI
          ffi: false,

          // No high-resolution time (timing attacks)
          hrtime: false,

          // Network: only allowed hosts
          net: capabilities.network ?? false,

          // No environment variables
          env: false,
        },
      },
    };

    return new Worker(workerUrl, denoOptions);
  }

  /**
   * Send a message to a plugin's Worker and wait for response
   */
  private sendToWorker(
    pluginName: string,
    type: WorkerMessageType,
    payload: Serializable
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
   * (strips non-serializable parts)
   */
  private serializePlugin(plugin: Plugin): Serializable {
    return {
      name: plugin.name,
      description: plugin.description,
      capabilities: plugin.capabilities,
      // Note: hooks and routes are function references,
      // the Worker has its own copy from the plugin source
    };
  }
}

/**
 * Create a Worker executor instance
 */
export function createWorkerExecutor(sandboxMode: SandboxMode = 'worker'): WorkerExecutor {
  return new WorkerExecutor(sandboxMode);
}
