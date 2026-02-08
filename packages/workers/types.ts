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
 */
export type FieldUIOverride =
  | null
  | { link: { label: string; href: string; target?: '_blank' } };

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
  /** Route handler - receives serializable request, returns serializable response */
  handler: (request: PluginRequest) => Promise<PluginResponse>;
}
