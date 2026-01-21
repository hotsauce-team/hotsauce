// Plugin system types
// All data is serializable to enable Worker isolation

import type { CrudAction } from '../types.ts';

// ─────────────────────────────────────────────────────────────
// Serializable constraint - enables Worker message passing
// ─────────────────────────────────────────────────────────────

/**
 * All data passed to/from plugins must be serializable.
 * This enables Worker isolation without API changes.
 * 
 * Plugins never receive:
 * - Functions (db handles, callbacks)
 * - Class instances
 * - Symbols
 * - Circular references
 */
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Serializable[]
  | { [key: string]: Serializable };

// ─────────────────────────────────────────────────────────────
// Plugin context - passed to all hooks
// ─────────────────────────────────────────────────────────────

/**
 * Context provided to plugin hooks.
 * Contains only serializable data - no db handles or functions.
 */
export interface PluginContext {
  /** Table name being operated on */
  table: string;
  /** CRUD action being performed */
  action: CrudAction;
  /** Authenticated user info (if available) */
  user?: {
    /** User ID (from JWT subject) */
    sub: string;
    /** User role (if provided in JWT) */
    role?: string;
  };
}

/**
 * Extended context for action hooks (after operation completes)
 */
export interface ActionContext extends PluginContext {
  /** Primary key of the affected record */
  recordId?: string | number;
  /** Previous record state (for update/delete) */
  oldData?: Serializable;
  /** New record state (for create/update) */
  newData?: Serializable;
  /** Timestamp of the action */
  timestamp: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────
// Transform hooks - modify data in the pipeline (always block)
// ─────────────────────────────────────────────────────────────

/**
 * Transform function signature.
 * Receives data, returns modified data. Always blocks.
 */
export type TransformFn = (
  ctx: PluginContext,
  data: Record<string, Serializable>
) => Promise<Record<string, Serializable>>;

/**
 * Transform hooks modify data as it flows through the pipeline.
 * These always block because they return transformed data.
 */
export interface TransformHooks {
  /**
   * Transform data before database write (create/update).
   * Return modified data or throw to abort the operation.
   * 
   * @example
   * ```ts
   * beforeSave: async (ctx, data) => {
   *   if (ctx.table === 'posts') {
   *     return { ...data, slug: slugify(data.title) };
   *   }
   *   return data;
   * }
   * ```
   */
  beforeSave?: TransformFn;

  /**
   * Transform data after database read (list/read).
   * Useful for adding computed fields or transforming values.
   * 
   * @example
   * ```ts
   * afterRead: async (ctx, data) => {
   *   if (data.avatarKey) {
   *     return { ...data, avatarUrl: getSignedUrl(data.avatarKey) };
   *   }
   *   return data;
   * }
   * ```
   */
  afterRead?: TransformFn;
}

// ─────────────────────────────────────────────────────────────
// Action hooks - side effects (optionally fire-and-forget)
// ─────────────────────────────────────────────────────────────

/**
 * Action handler function signature
 */
export type ActionHandlerFn = (ctx: ActionContext) => Promise<void>;

/**
 * Action hook with configuration options
 */
export interface ActionHookConfig {
  /** The action handler function */
  handler: ActionHandlerFn;
  /**
   * If true, don't block the HTTP response waiting for this hook.
   * Errors are logged but won't affect the user.
   * 
   * @default false
   */
  fireAndForget?: boolean;
}

/**
 * Action hook - either a simple function (blocking) or config object
 */
export type ActionHook = ActionHandlerFn | ActionHookConfig;

/**
 * Action hooks for CRUD operations.
 * Called after the operation completes successfully.
 * Use for audit logging, webhooks, notifications, cache invalidation, etc.
 * 
 * @example
 * ```ts
 * on: {
 *   // Simple form - blocks response
 *   create: async (ctx) => { await sendWebhook(ctx); },
 *   
 *   // Config form - fire and forget
 *   update: {
 *     handler: async (ctx) => { await auditLog(ctx); },
 *     fireAndForget: true,
 *   },
 * }
 * ```
 */
export interface ActionHooks {
  /** Called after a record is created */
  create?: ActionHook;
  /** Called after a record is read/viewed */
  read?: ActionHook;
  /** Called after a record is updated */
  update?: ActionHook;
  /** Called after a record is deleted */
  delete?: ActionHook;
  /** Called after a list query */
  list?: ActionHook;
}

// ─────────────────────────────────────────────────────────────
// Combined plugin hooks
// ─────────────────────────────────────────────────────────────

/**
 * All hooks a plugin can implement.
 * 
 * - `transform`: Modify data in the pipeline (always blocks)
 * - `on`: Side effects after operations (optionally fire-and-forget)
 */
export interface PluginHooks {
  /**
   * Transform hooks modify data as it flows through.
   * Always block because they return transformed data.
   */
  transform?: TransformHooks;
  
  /**
   * Action hooks for side effects after CRUD operations.
   * Can be configured to fire-and-forget (non-blocking).
   */
  on?: ActionHooks;
}

// ─────────────────────────────────────────────────────────────
// Plugin routes - custom endpoints
// ─────────────────────────────────────────────────────────────

/**
 * Serializable representation of a request (for Worker messaging)
 */
export interface PluginRequest {
  /** URL path parameters */
  params: Record<string, string>;
  /** Query string parameters */
  query: Record<string, string>;
  /** Request body (parsed JSON or form data) */
  body?: Serializable;
  /** Request headers (selected safe headers only) */
  headers: Record<string, string>;
}

/**
 * Serializable representation of a response (for Worker messaging)
 */
export interface PluginResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body (will be JSON serialized) */
  body?: Serializable;
}

/**
 * A custom route provided by a plugin
 */
export interface PluginRoute {
  /** Path pattern (e.g., '/upload/:table') relative to basePath */
  path: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /**
   * Route handler - receives serializable request, returns serializable response.
   * Runs in Worker sandbox.
   */
  handler: (request: PluginRequest) => Promise<PluginResponse>;
}

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
 *       update: { handler: auditLog, fireAndForget: true },
 *       delete: { handler: auditLog, fireAndForget: true },
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

  /** Declared capabilities (for security/documentation) */
  capabilities?: PluginCapabilities;

  /** Lifecycle hooks */
  hooks?: PluginHooks;

  /** Custom routes */
  routes?: PluginRoute[];

  /**
   * Custom field renderers (registered separately in UI package).
   * Maps field type or column name pattern to renderer name.
   * 
   * @example
   * ```ts
   * fields: {
   *   'file': 'file-upload',        // Match by field type
   *   'avatar': 'image-preview',    // Match by column name
   * }
   * ```
   */
  fields?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Plugin configuration for CMS
// ─────────────────────────────────────────────────────────────

/**
 * Sandbox mode for plugin execution
 */
export type SandboxMode =
  /** Standard Worker isolation (works on all runtimes) */
  | 'worker'
  /** Deno Worker with restricted permissions (Deno only, strongest isolation) */
  | 'deno-sandbox';

/**
 * Plugin configuration passed to createCmsHandler
 */
export interface PluginConfig {
  /** The plugin definition */
  plugin: Plugin;

  /**
   * Configuration passed to the plugin.
   * Must be serializable (sent to Worker).
   */
  config?: Serializable;
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
