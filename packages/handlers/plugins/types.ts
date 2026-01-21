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
 * Extended context for onAction hook (after operation completes)
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
// Plugin hooks - data transformation and side effects
// ─────────────────────────────────────────────────────────────

/**
 * Hooks that plugins can implement.
 * All hooks are async and work with serializable data only.
 */
export interface PluginHooks {
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
  beforeSave?: (
    ctx: PluginContext,
    data: Record<string, Serializable>
  ) => Promise<Record<string, Serializable>>;

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
  afterRead?: (
    ctx: PluginContext,
    data: Record<string, Serializable>
  ) => Promise<Record<string, Serializable>>;

  /**
   * Called after a successful CRUD operation.
   * Use for audit logging, webhooks, cache invalidation, etc.
   * 
   * This hook cannot modify data or abort the operation.
   * Errors are logged but don't affect the response.
   * 
   * @example
   * ```ts
   * onAction: async (ctx) => {
   *   await sendToAuditLog({
   *     table: ctx.table,
   *     action: ctx.action,
   *     recordId: ctx.recordId,
   *     userId: ctx.user?.sub,
   *     timestamp: ctx.timestamp,
   *   });
   * }
   * ```
   */
  onAction?: (ctx: ActionContext) => Promise<void>;
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
   * Hook types the plugin uses
   */
  hooks?: (keyof PluginHooks)[];

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
 *     hooks: ['onAction'],
 *     network: ['audit-api.example.com'],
 *   },
 *   hooks: {
 *     onAction: async (ctx) => {
 *       await fetch('https://audit-api.example.com/log', {
 *         method: 'POST',
 *         body: JSON.stringify(ctx),
 *       });
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
