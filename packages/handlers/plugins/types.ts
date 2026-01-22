// Plugin system types
// Re-exports from @drizzle-cms/handlers-workers with CMS-specific additions

// Re-export all types from handlers-workers
export type {
  Serializable,
  SerializableValue,
  SerializableObject,
  PluginContext,
  ActionContext,
  PluginHooks,
  TransformHooks,
  ActionHooks,
  TransformFn,
  ActionHook,
  ActionHookConfig,
  ActionHandlerFn,
  PluginRequest,
  PluginResponse,
  PluginRoute,
  SandboxMode,
  CrudAction,
} from '@drizzle-cms/handlers-workers';

// Import for use in local type definitions
import type {
  PluginHooks,
  PluginRoute,
  SandboxMode,
  TransformHooks,
  ActionHooks,
} from '@drizzle-cms/handlers-workers';

// ─────────────────────────────────────────────────────────────
// Plugin capabilities - declared permissions
// ─────────────────────────────────────────────────────────────

/**
 * Capabilities a plugin declares it needs.
 * Used for documentation and (on Deno) enforced via Worker permissions.
 */
export interface PluginCapabilities {
  /**
   * Network hosts the plugin needs to access.
   * Use '*' for any host (discouraged).
   * 
   * @example ['api.example.com', '*.s3.amazonaws.com']
   */
  network?: string[];

  /**
   * Transform hooks the plugin uses
   */
  transforms?: (keyof TransformHooks)[];

  /**
   * Action hooks the plugin uses
   */
  actions?: (keyof ActionHooks)[];

  /**
   * Route paths the plugin registers
   */
  routes?: string[];
}

// ─────────────────────────────────────────────────────────────
// Plugin definition
// ─────────────────────────────────────────────────────────────

/**
 * A CMS plugin definition.
 * 
 * Plugins run in Worker isolation - they cannot access:
 * - The database directly
 * - Environment variables
 * - The filesystem
 * - Global state
 * 
 * All communication happens via serializable messages.
 * 
 * @example
 * ```ts
 * const auditPlugin: Plugin = {
 *   name: 'audit-log',
 *   capabilities: {
 *     actions: ['create', 'update', 'delete'],
 *     network: ['audit-api.example.com'],
 *   },
 *   hooks: {
 *     on: {
 *       create: {
 *         handler: async (ctx) => {
 *           await fetch('https://audit-api.example.com/log', {
 *             method: 'POST',
 *             body: JSON.stringify(ctx),
 *           });
 *         },
 *         fireAndForget: true,
 *       },
 *     },
 *   },
 * };
 * ```
 */
export interface Plugin {
  /** Unique plugin identifier */
  name: string;

  /** Human-readable description */
  description?: string;

  /**
   * URL of the plugin module for Worker isolation.
   * The Worker will dynamically import this module.
   * 
   * The module must export a `createPlugin(config)` factory function.
   * If not provided, hooks run in-process (not isolated).
   * 
   * @example
   * ```ts
   * moduleUrl: new URL('./plugins/audit-log.worker.ts', import.meta.url).href,
   * ```
   */
  moduleUrl?: string;

  /** Declared capabilities (for security/documentation) */
  capabilities?: PluginCapabilities;

  /** Lifecycle hooks */
  hooks?: PluginHooks;

  /** Custom routes */
  routes?: PluginRoute[];

  /**
   * Custom field renderers (registered separately in UI package).
   * Maps field type or column name pattern to renderer name.
   */
  fields?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Plugin configuration for CMS
// ─────────────────────────────────────────────────────────────

/**
 * Remote plugin reference - loads plugin code entirely in Worker isolation.
 * Use this when you don't want ANY plugin code to run in the main thread.
 * 
 * @example
 * ```ts
 * plugins: [
 *   {
 *     // Plugin loaded entirely in Worker - no code runs in main thread
 *     moduleUrl: 'https://example.com/plugins/audit-log.js',
 *     config: { webhookUrl: 'https://audit.example.com/events' },
 *   },
 * ]
 * ```
 */
export interface RemotePluginConfig {
  /**
   * URL of the plugin module to load in the Worker.
   * The module must export a `createPlugin(config)` factory function
   * that returns { name, hooks, routes? }.
   */
  moduleUrl: string;

  /**
   * Configuration passed to the plugin's createPlugin() factory.
   * Must be serializable (JSON-compatible). Use a typed interface
   * with `import type` for better DX without running plugin code.
   */
  config?: object;

  /**
   * Optional name override (otherwise derived from module response).
   * Useful for identifying the plugin in logs/errors before it's loaded.
   */
  name?: string;
}

/**
 * Plugin configuration passed to createCmsHandler.
 * 
 * Two forms are supported:
 * 1. `{ plugin: Plugin }` - Plugin object (may run code in main thread for validation)
 * 2. `{ moduleUrl: string }` - Remote plugin (all code runs in Worker)
 */
export type PluginConfig = 
  | { plugin: Plugin; config?: object }
  | RemotePluginConfig;

/**
 * Type guard to check if config is a remote plugin reference
 */
export function isRemotePlugin(config: PluginConfig): config is RemotePluginConfig {
  return 'moduleUrl' in config && !('plugin' in config);
}

/**
 * Options for the plugin system
 */
export interface PluginsOptions {
  /** Registered plugins */
  plugins?: PluginConfig[];

  /**
   * Sandbox mode for plugin execution.
   * 
   * - 'worker': Standard Worker isolation (all runtimes)
   * - 'deno-sandbox': Deno Worker with permissions (Deno only)
   * 
   * Default: 'worker'
   */
  sandbox?: SandboxMode;
}
