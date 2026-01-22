// Plugin system types
// Re-exports from @drizzle-cms/handlers-workers with CMS-specific additions

// Re-export all types from handlers-workers
export type {
  ActionContext,
  ActionHandlerFn,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  CrudAction,
  PluginContext,
  PluginHooks,
  PluginRequest,
  PluginResponse,
  PluginRoute,
  Serializable,
  SerializableObject,
  SerializableValue,
  TransformFn,
  TransformHooks,
} from '@drizzle-cms/handlers-workers';

// Import for use in local type definitions
import type {
  ActionHooks,
  CrudAction,
  PluginHooks,
  PluginRoute,
  TransformHooks,
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
// Plugin filter context - for deciding whether to invoke hooks
// ─────────────────────────────────────────────────────────────

/**
 * Hook types that can be filtered
 */
export type HookType =
  | 'transform:beforeSave'
  | 'transform:afterRead'
  | 'action';

/**
 * Context passed to the filter function.
 * Used to decide whether a hook should be invoked.
 */
export interface FilterContext {
  /** The type of hook being invoked */
  hookType: HookType;
  /** Table name being operated on */
  table: string;
  /** CRUD action being performed */
  action: CrudAction;
  /** Authenticated user info (if available) */
  user?: {
    sub: string;
    role?: string;
  };
}

/**
 * Filter function type.
 * Return true to invoke the hook, false to skip.
 */
export type PluginFilter = (ctx: FilterContext) => boolean;

// ─────────────────────────────────────────────────────────────
// Plugin configuration for CMS
// ─────────────────────────────────────────────────────────────

/**
 * Plugin configuration passed to createCmsHandler.
 *
 * Two execution modes based on presence of `worker`:
 *
 * 1. **Worker-isolated** (has `worker`): Plugin code runs entirely in the Worker.
 *    Use `filter` to control which hooks are forwarded to the Worker.
 *
 * 2. **In-process** (no `worker`): Plugin hooks run directly in the main thread.
 *    Use `filter` to skip hook invocation for certain contexts.
 *
 * @example
 * ```ts
 * plugins: [
 *   // Worker-isolated with filter (recommended for third-party)
 *   {
 *     name: 'audit-log',
 *     worker: new Worker(import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'), {
 *       type: 'module',
 *       deno: { permissions: { net: ['audit.example.com'] } },
 *     }),
 *     // Only forward create/update/delete actions, skip reads and lists
 *     filter: (ctx) => ctx.hookType === 'action' && !['read', 'list'].includes(ctx.action),
 *     config: { webhookUrl: 'https://audit.example.com/events' },
 *   },
 *
 *   // In-process with filter
 *   {
 *     name: 'custom-logger',
 *     hooks: {
 *       on: { create: async (ctx) => console.log('Created', ctx.recordId) },
 *     },
 *     // Skip logging for admin users
 *     filter: (ctx) => ctx.user?.role !== 'admin',
 *   },
 * ]
 * ```
 */
export interface PluginConfig {
  /** Unique plugin identifier */
  name: string;

  /** Human-readable description */
  description?: string;

  /**
   * Pre-created Worker instance for isolated execution.
   * If provided, messages are sent to the Worker.
   * If omitted, hooks run in-process (main thread).
   */
  worker?: Worker;

  /**
   * Filter function to control when hooks are invoked.
   * Return true to invoke/forward the hook, false to skip.
   * If omitted, all hooks are invoked.
   *
   * @example
   * ```ts
   * // Only handle action hooks (skip transforms)
   * filter: (ctx) => ctx.hookType === 'action'
   *
   * // Skip certain tables
   * filter: (ctx) => ctx.table !== 'sessions'
   *
   * // Multiple conditions
   * filter: (ctx) => ctx.hookType === 'action' && ['create', 'update', 'delete'].includes(ctx.action)
   * ```
   */
  filter?: PluginFilter;

  /**
   * Lifecycle hooks (for in-process plugins).
   * Worker plugins define hooks in the Worker module, not here.
   */
  hooks?: PluginHooks;

  /** Declared capabilities (for documentation and validation) */
  capabilities?: PluginCapabilities;

  /** Custom routes (in-process only) */
  routes?: PluginRoute[];

  /**
   * Configuration passed to the Worker's createPlugin() factory.
   * Must be serializable (JSON-compatible).
   */
  config?: object;
}

/**
 * Type guard to check if plugin runs in a Worker
 */
export function isWorkerPlugin(config: PluginConfig): boolean {
  return config.worker !== undefined;
}

/**
 * Options for the plugin system
 */
export interface PluginsOptions {
  /** Registered plugins */
  plugins?: PluginConfig[];
}
