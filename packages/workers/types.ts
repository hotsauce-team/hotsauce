// Plugin types for Worker isolation
// These types define the contract between plugins and the Worker sandbox

// ─────────────────────────────────────────────────────────────
// CRUD Action type (standalone to avoid circular deps)
// ─────────────────────────────────────────────────────────────

/**
 * CRUD operations supported by the CMS
 */
export type CrudAction = 'create' | 'read' | 'update' | 'delete' | 'list';

// ─────────────────────────────────────────────────────────────
// Serializable constraint - enables Worker message passing
// ─────────────────────────────────────────────────────────────

/**
 * Serializable object - an object with serializable values.
 * Used for plugin config and context data.
 */
export type SerializableObject = { [key: string]: SerializableValue };

/**
 * Serializable values that can be passed to/from Workers.
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | SerializableValue[]
  | SerializableObject;

/**
 * All data passed to/from plugins must be serializable.
 * This enables Worker isolation without API changes.
 *
 * Plugins never receive:
 * - Functions (db handles, callbacks)
 * - Class instances
 * - Symbols
 * - Circular references
 *
 * For plugin config, use a typed interface that extends SerializableObject,
 * or cast to Serializable when passing to the CMS.
 */
export type Serializable = SerializableValue;

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
  /**
   * Plugin-specific configuration for each column opted-in to this plugin.
   * Keyed by column name, value is the config from `$cms({ plugins: { pluginName: config } })`.
   *
   * For **column-scoped plugins**: Contains only columns with this plugin declared.
   * For **table-scoped plugins**: Contains the table-level plugin config (keyed by special `_table` key).
   *
   * @example
   * ```ts
   * // Column-scoped: only markdown columns
   * // columns = { content: { role: 'source', output: 'contentHtml' }, contentHtml: { role: 'output' } }
   *
   * // Table-scoped: table config
   * // columns = { _table: { level: 'full' } }
   * ```
   */
  columns?: Record<string, Serializable>;
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
 * Can be sync or async - both work.
 */
export type TransformFn = (
  ctx: PluginContext,
  data: Record<string, Serializable>,
) => Promise<Record<string, Serializable>> | Record<string, Serializable>;

/**
 * Transform hooks modify data as it flows through the pipeline.
 * These always block because they return transformed data.
 */
export interface TransformHooks {
  /**
   * Transform data before database write (create/update).
   * Return modified data or throw to abort the operation.
   */
  beforeSave?: TransformFn;

  /**
   * Transform data after database read (list/read).
   * Useful for adding computed fields or transforming values.
   */
  afterRead?: TransformFn;
}

// ─────────────────────────────────────────────────────────────
// UI hooks - customize field rendering (always block)
// ─────────────────────────────────────────────────────────────

/**
 * Simplified field info passed to UI hooks.
 * Contains only serializable properties from CMSField.
 */
export interface UIFieldInfo {
  /** Column name in the database */
  name: string;
  /** Display label for the field */
  label: string;
  /** CMS field type (text, number, select, json, file, etc.) */
  fieldType: string;
  /** Database column type */
  columnType: string;
  /** Whether the field is required */
  required: boolean;
  /** Whether the field is read-only */
  readOnly: boolean;
  /**
   * This plugin's config from the column's `.$cms({ plugins: { [name]: config } })`.
   * Only present if the column has config for the plugin receiving this context.
   *
   * @example
   * ```ts
   * // Column: content: text().$cms({ plugins: { puck: { variant: 'full' } } })
   * // In puck plugin's renderField hook:
   * if (ctx.field.plugin) {  // truthy = this field uses puck
   *   const variant = ctx.field.plugin.variant;  // 'full'
   * }
   * ```
   */
  plugin?: Serializable;
  /** @internal All plugin configs - used to extract per-plugin config */
  _plugins?: Record<string, Serializable>;
}

/**
 * Context for UI renderField hook.
 * Contains field info, current value, and record context.
 */
export interface UIRenderFieldContext {
  /** Table name */
  table: string;
  /** Field information */
  field: UIFieldInfo;
  /** Current field value */
  value: Serializable;
  /** Record ID (undefined on create) */
  recordId?: string | number;
  /** View type: 'edit' for edit form, 'create' for create form */
  view: 'edit' | 'create';
  /** Authenticated user info (if available) */
  user?: {
    sub: string;
    role?: string;
  };
}

/**
 * Override the default field input UI.
 *
 * Return from renderField hook to customize how a field is rendered:
 * - `null` or `undefined`: Show the default input
 * - `{ link: ... }`: Replace the input with a link (e.g., to an external editor)
 * - `{ valueSummary: ... }`: Replace raw value display with human-readable text
 */
export type FieldUIOverride =
  | null
  | {
    link?: { label: string; href: string; target?: '_blank' };
    /** Human-readable summary to show instead of raw value (plain text, no HTML) */
    valueSummary?: string;
  };

/**
 * UI render field function signature.
 * Receives field context, returns UI override or null for default.
 */
export type UIRenderFieldFn = (
  ctx: UIRenderFieldContext,
) => Promise<FieldUIOverride> | FieldUIOverride;

/**
 * UI hooks customize how fields are rendered.
 * These always block because they return rendering instructions.
 */
export interface UIHooks {
  /**
   * Customize field rendering on edit/create forms.
   * Return null for default input, or an override object.
   */
  renderField?: UIRenderFieldFn;
}

// ─────────────────────────────────────────────────────────────
// Action hooks - side effects (optionally fire-and-forget)
// ─────────────────────────────────────────────────────────────

/**
 * Action handler function signature.
 * Can be sync or async - both work.
 */
export type ActionHandlerFn = (ctx: ActionContext) => Promise<void> | void;

/**
 * Action hook with configuration options
 */
export interface ActionHookConfig {
  /** The action handler function */
  handler: ActionHandlerFn;
  /**
   * If true (default), wait for the hook to complete before responding.
   * Errors will bubble up and affect the response.
   *
   * If false, run as fire-and-forget: don't block the HTTP response.
   * Errors are logged via onError but won't affect the user.
   *
   * @default true
   */
  blocking?: boolean;
}

/**
 * Action hook - either a simple function (blocking) or config object
 */
export type ActionHook = ActionHandlerFn | ActionHookConfig;

/**
 * Action hooks for CRUD operations.
 * Called after the operation completes successfully.
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
 */
export interface PluginHooks {
  /** Transform hooks modify data as it flows through (always blocks) */
  transform?: TransformHooks;
  /** UI hooks customize field rendering (always blocks) */
  ui?: UIHooks;
  /** Action hooks for side effects after CRUD operations */
  on?: ActionHooks;
}

// ─────────────────────────────────────────────────────────────
// Plugin routes - custom endpoints
// ─────────────────────────────────────────────────────────────

/**
 * Context provided to plugin route handlers.
 * Contains serializable data about the request, record, and field.
 * Same context is provided to both in-process handlers and Worker renders.
 */
export interface PluginRouteContext {
  /** Table name from URL */
  table: string;
  /** Record ID from URL */
  recordId: string;
  /** Column name from URL (optional - not all routes are column-specific) */
  column?: string;
  /** Full record data (CMS fetches before calling plugin) */
  record: Record<string, Serializable>;
  /** Shortcut: record[column] value */
  value: Serializable;
  /** Field information (if column specified) */
  field?: {
    /** Column name */
    name: string;
    /** CMS field type (text, json, etc.) */
    type: string;
    /** Field config from $cms() hints */
    config: Record<string, Serializable>;
  };
  /** Authenticated user (if any) */
  user?: {
    sub: string;
    role?: string;
    [key: string]: Serializable;
  };
  /** CSRF token for forms */
  csrfToken: string;
  /** Source token for forms (identifies request origin - CMS vs plugin) */
  sourceToken: string;
  /** CMS base path (e.g., '/admin') */
  basePath: string;
  /** Full request URL */
  requestUrl: string;
  /** HTTP method (GET, POST) */
  method: string;
  /** Additional route params from pattern matching */
  params: Record<string, string>;
}

/**
 * Route handler function for in-process plugins.
 * Returns Response directly (can set custom headers, status).
 */
export type PluginRouteHandler = (
  ctx: PluginRouteContext,
) => Response | string | Promise<Response | string>;

/**
 * A custom route provided by a plugin.
 *
 * Routes are namespaced under the plugin name: /admin/{pluginName}/{pattern}
 *
 * Use `handler` for in-process execution (returns Response).
 * Use `render` for Worker execution (sends message, receives HTML string).
 */
export interface PluginRoute {
  /**
   * URL pattern relative to /admin/{pluginName}/
   * Supports :param placeholders.
   *
   * @example ':table/:id/:column' → /admin/puck/posts/1/body
   */
  pattern: string;

  /**
   * HTTP methods supported by this route.
   * If omitted, defaults to ['GET'].
   */
  methods?: Array<'GET' | 'POST'>;

  /**
   * In-process handler function.
   * Receives PluginRouteContext, returns Response or HTML string.
   * Cannot be used with `render`.
   */
  handler?: PluginRouteHandler;

  /**
   * Worker render message type.
   * CMS sends this message type to Worker with PluginRouteContext.
   * Worker should respond with { id, html: string }.
   * Cannot be used with `handler`.
   *
   * @example 'renderEditor' → Worker receives { type: 'renderEditor', id, context }
   */
  render?: string;
}
