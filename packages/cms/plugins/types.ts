// Plugin system types
// Re-exports from @hotsauce/workers with CMS-specific additions

// Re-export all types from handlers-workers
export type {
  ActionContext,
  ActionHandlerFn,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  CrudAction,
  FieldUIOverride,
  FlashMessage,
  PluginContext,
  PluginHooks,
  PluginRoute,
  PluginRouteContext,
  PluginRouteHandler,
  ResolveFlashesContext,
  Serializable,
  SerializableObject,
  SerializableValue,
  TransformFn,
  TransformHooks,
  UIFieldInfo,
  UIHooks,
  UIRenderFieldContext,
  UIRenderFieldFn,
  UIResolveFlashesFn,
} from '@hotsauce/workers';

// Import for use in local type definitions
import type {
  ActionHooks,
  CrudAction,
  PluginHooks,
  PluginRoute,
  TransformHooks,
  UIHooks,
} from '@hotsauce/workers';

// Import storage types (type-only to avoid circular runtime dependency)
import type { StorageProvider } from '../types.ts';

// Re-export StorageProvider for consumers
export type { StorageProvider };

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
   * UI hooks the plugin uses
   */
  ui?: (keyof UIHooks)[];

  /**
   * Action hooks the plugin uses
   */
  actions?: (keyof ActionHooks)[];

  /**
   * Route paths the plugin registers
   */
  routes?: string[];
}

// Re-export error context from handlers-workers
export type { PluginErrorContext, PluginErrorHandler } from '@hotsauce/workers';

// ─────────────────────────────────────────────────────────────
// Plugin filter context - for deciding whether to invoke hooks
// ─────────────────────────────────────────────────────────────

/**
 * Hook types that can be filtered
 */
export type HookType =
  | 'transform:beforeSave'
  | 'transform:afterRead'
  | 'ui:renderField'
  | 'ui:resolveFlashes'
  | 'action'
  | 'route';

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
/**
 * Filter function type.
 * Return true to invoke the hook, false to skip.
 *
 * Use `'dangerously-open'` to explicitly allow all data to flow to the plugin.
 */
export type PluginFilter =
  | ((ctx: FilterContext) => boolean)
  | 'dangerously-open';

// ─────────────────────────────────────────────────────────────
// Worker hook declarations (declarative, not functions)
// ─────────────────────────────────────────────────────────────

/**
 * Declarative hook names for Worker plugins.
 * Worker plugins declare which hooks they handle; the actual functions
 * live in the Worker module, not in the main thread config.
 */
export interface WorkerHookDeclaration {
  /**
   * Transform hooks the Worker handles.
   * @example ['beforeSave', 'afterRead']
   */
  transform?: (keyof TransformHooks)[];

  /**
   * UI hooks the Worker handles.
   *
   * @example ['renderField', 'resolveFlashes']
   */
  ui?: (keyof UIHooks)[];

  /**
   * Action hooks the Worker handles.
   * @example ['create', 'update', 'delete']
   */
  on?: CrudAction[];
}

// ─────────────────────────────────────────────────────────────
// Plugin configuration for CMS
// ─────────────────────────────────────────────────────────────

/**
 * Base plugin configuration shared by both Worker and in-process plugins.
 */
interface PluginConfigBase {
  /** Unique plugin identifier */
  name: string;

  /** Human-readable description */
  description?: string;

  /**
   * Optional filter to control when hooks are invoked.
   *
   * **Schema-driven by default**: When omitted, the plugin only receives data for
   * tables/columns that declare `$cms({ plugins: { [pluginName]: ... } })`.
   * This is secure-by-default - plugins never see undeclared data.
   *
   * When provided, it adds additional filtering on top of schema-driven scoping.
   * Use `'dangerously-open'` to bypass all filtering (receive all data).
   *
   * @example
   * ```ts
   * // Schema-driven (default): only receive declared columns/tables
   * // No filter needed
   *
   * // Skip certain tables even if they declare the plugin
   * filter: (ctx) => ctx.table !== 'sessions'
   *
   * // Allow all data (bypass schema-driven scoping)
   * filter: 'dangerously-open'
   * ```
   */
  filter?: PluginFilter;

  /** Declared capabilities (for documentation and validation) */
  capabilities?: PluginCapabilities;

  /**
   * Configuration passed to the Worker's createPlugin() factory.
   * Must be serializable (JSON-compatible).
   */
  config?: object;
}

/**
 * Worker plugin configuration.
 * Plugin code runs entirely in an isolated Worker thread.
 *
 * @example
 * ```ts
 * {
 *   name: 'audit-log',
 *   worker: new Worker(import.meta.resolve('@hotsauce/plugins/audit-log/worker'), {
 *     type: 'module',
 *     deno: { permissions: { net: ['audit.example.com'] } },
 *   }),
 *   // Declare which hooks the Worker handles (actual functions live in the Worker)
 *   hooks: {
 *     on: ['create', 'update', 'delete'],
 *   },
 *   filter: (ctx) => ctx.hookType === 'action',
 *   config: { webhookUrl: 'https://audit.example.com/events' },
 * }
 * ```
 */
export interface WorkerPluginConfig extends PluginConfigBase {
  /** Worker instance for isolated execution */
  worker: Worker;

  /**
   * Declarative hooks - lists which hooks the Worker handles.
   * The actual hook functions are defined in the Worker module.
   * If omitted, the Worker receives all hook types (filtered by `filter`).
   */
  hooks?: WorkerHookDeclaration;

  /**
   * Routes handled by this Worker plugin.
   * Worker routes MUST use `render` (message type), not `handler`.
   * Routes are namespaced: /admin/{pluginName}/{pattern}
   */
  routes?: PluginRoute[];
}

/**
 * In-process plugin configuration.
 * Plugin hooks run directly in the main thread.
 *
 * @example
 * ```ts
 * {
 *   name: 'format-names',
 *   hooks: {
 *     transform: {
 *       beforeSave: (ctx, data) => {
 *         if (ctx.table === 'users') {
 *           data.name = capitalize(data.name);
 *         }
 *         return data;
 *       },
 *     },
 *   },
 *   filter: (ctx) => ctx.table !== 'sessions',
 * }
 * ```
 */
export interface InProcessPluginConfig extends PluginConfigBase {
  /** No Worker = in-process execution */
  worker?: never;

  /**
   * Lifecycle hooks with actual functions.
   * These run directly in the main thread.
   */
  hooks?: PluginHooks;

  /** Custom routes (in-process only) */
  routes?: PluginRoute[];

  /**
   * Optional storage provider registration.
   * Plugins can contribute storage backends (S3, R2, FS, etc.).
   * The CMS extracts these during init and builds a storage registry.
   *
   * @example
   * ```ts
   * createS3StoragePlugin({
   *   storageId: 's3',
   *   bucket: 'my-uploads',
   *   // ...
   * }) // Returns config with storageProvider set
   * ```
   */
  storageProvider?: StorageProvider;
}

/**
 * Plugin configuration - either Worker-isolated or in-process.
 *
 * @example
 * ```ts
 * plugins: [
 *   // Worker-isolated (recommended for third-party plugins)
 *   {
 *     name: 'audit-log',
 *     worker: auditWorker,
 *     hooks: { on: ['create', 'update', 'delete'] }, // Declarative
 *     filter: (ctx) => ctx.hookType === 'action',
 *   },
 *
 *   // In-process (for your own trusted code)
 *   {
 *     name: 'custom-logger',
 *     hooks: {
 *       on: { create: async (ctx) => console.log('Created', ctx.recordId) },
 *     },
 *     filter: (ctx) => ctx.user?.role !== 'admin',
 *   },
 * ]
 * ```
 */
export type PluginConfig = WorkerPluginConfig | InProcessPluginConfig;

/**
 * Type guard to check if a plugin is configured to run in a Worker.
 *
 * Worker plugins have their code executed in an isolated Worker thread,
 * while in-process plugins run directly in the main thread.
 *
 * @param config - The plugin configuration to check
 * @returns `true` if the plugin has a Worker instance configured
 *
 * @example
 * ```ts
 * if (isWorkerPlugin(pluginConfig)) {
 *   // Plugin runs in isolated Worker
 * } else {
 *   // Plugin runs in main thread
 * }
 * ```
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
