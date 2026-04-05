// Types for CMS-specific metadata stored on Drizzle column builders/columns and tables.

// ─────────────────────────────────────────────────────────────
// Plugin column configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for a plugin's access to a column.
 *
 * - `true`: Shorthand for `{ write: true, read: true }` (full access)
 * - Object: Explicit permissions and future extension point
 *
 * @example
 * ```ts
 * // Shorthand: puck can read + write this column
 * content: json().$cms({ plugins: { puck: true } })
 *
 * // Explicit: puck can only write, not read
 * content: json().$cms({ plugins: { puck: { write: true } } })
 * ```
 */
export type PluginColumnConfig =
  | true
  | {
    /** Whether the plugin can write to this column (default: false) */
    write?: boolean;
    /** Whether the plugin can read this column (default: true if write is true) */
    read?: boolean;
    /** Extension point for future plugin-specific options */
    [key: string]: unknown;
  };

/**
 * Configuration for file fields.
 *
 * - `true`: Shorthand for using default file validation options
 * - Object: Explicit file validation options
 */
export type FileColumnConfig =
  | true
  | {
    /** MIME type filter for file input (default: 'image/*') */
    accept?: string;
    /** Maximum file size in bytes (default: 200000 = 200KB) */
    maxSize?: number;
    /** Allow SVG previews in UI (default: false) */
    previewSvg?: boolean;
  };

// ─────────────────────────────────────────────────────────────
// Column-level CMS options
// ─────────────────────────────────────────────────────────────

/**
 * Options for customizing how a column appears in the CMS.
 * Applied via `column.$cms({ ... })` method.
 */
export type CmsColumnOptions = {
  /** Treat this column as a file reference (UI: file input). */
  file?: FileColumnConfig;
  /** Hide this field from all CMS views (forms, lists, detail). Still saved to DB. */
  hidden?: boolean;
  /** Show this field but prevent editing. */
  readOnly?: boolean;
  /**
   * Use this column as the thumbnail in list views.
   * When set, the table defaults to grid view with a toggle to switch to table.
   * Works with file columns (FileReference) and plain URL string columns.
   */
  thumbnail?: boolean;
  /**
   * Plugin-specific configuration, keyed by plugin name.
   * Controls which plugins can read/write this column.
   *
   * @example
   * ```ts
   * // Puck editor can write to this column
   * content: json().$cms({ plugins: { puck: true } })
   *
   * // Multiple plugins
   * content: json().$cms({ plugins: {
   *   puck: true,
   *   'block-editor': { write: true },
   * }})
   * ```
   */
  plugins?: Record<string, PluginColumnConfig>;
};

/** Default accept filter for file inputs */
export const FILE_DEFAULT_ACCEPT = 'image/*';

/** Default max file size in bytes (200KB) */
export const FILE_DEFAULT_MAX_SIZE = 200_000;

/**
 * Standard shape for file data stored in JSON columns.
 * Used by CMS handlers and can be extended by plugins.
 */
export type FileReference = {
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'image/png') */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Base64-encoded file data (MVP db storage) */
  data?: string;
  /** Storage key (S3/R2 plugin) */
  key?: string;
  /** Public URL (CDN/direct access) */
  url?: string;
  /**
   * Storage provider instance ID (e.g., 's3', 'r2', 'minio').
   * Used to route reads/deletes to the correct provider.
   *
   * Fallback rules when missing:
   * - If `data` exists: treat as 'db' (inline storage)
   * - Else if `url` exists: treat as 'public' (no provider needed)
   * - Else if `key` exists: use defaultObjectStorageId from config
   */
  storage?: string;
};

// ─────────────────────────────────────────────────────────────
// Table-level CMS options
// ─────────────────────────────────────────────────────────────

/**
 * Function type for generating frontend URLs from a record.
 * Return null/undefined to hide the "View on site" link.
 */
export type FrontendUrlFn = (
  record: Record<string, unknown>,
) => string | null | undefined;

/**
 * Options for customizing how a table appears in the CMS.
 * Applied via `table.$cms({ ... })` method.
 */
export type CmsTableOptions = {
  /**
   * Generate a frontend URL for viewing this record on the site.
   * Can be a function that receives the record and returns a URL string,
   * or null/undefined to hide the link.
   *
   * @example
   * ```ts
   * pgTable('posts', { ... }).$cms({
   *   frontendUrl: (post) => `/blog/${post.slug}`
   * });
   * ```
   */
  frontendUrl?: FrontendUrlFn;

  /**
   * Display label for this table in the CMS sidebar (singular).
   * Defaults to the table name with basic formatting.
   */
  label?: string;

  /**
   * Plural display label for this table.
   * Defaults to `${label}s` or table name.
   */
  labelPlural?: string;

  /**
   * Hide this table from the CMS sidebar.
   * Records can still be accessed via direct URL if needed.
   */
  hidden?: boolean;

  /**
   * Icon identifier for the sidebar (future use).
   */
  icon?: string;

  /**
   * Auto-create a draft row when visiting the create page.
   *
   * When true, "Create New" inserts a row with all defaults and redirects to
   * the edit page. This enables features that need a record ID before saving
   * (e.g. S3 uploads, Puck editor).
   *
   * Requires every non-PK column to have a default or be nullable.
   * The CMS validates this at startup and throws if the schema doesn't support it.
   *
   * @example
   * ```ts
   * pgTable('media', {
   *   id: uuid('id').primaryKey().defaultRandom(),
   *   file: jsonb('file'),
   *   published: boolean('published').notNull().default(false),
   * }).$cms({ autoDraft: true });
   * ```
   */
  autoDraft?: boolean;

  /**
   * Table-level plugin configuration, keyed by plugin name.
   * Plugins declared here receive the full record for transform/action hooks.
   *
   * @example
   * ```ts
   * // Audit log receives full record on create/update/delete
   * pgTable('posts', { ... }).$cms({
   *   plugins: { 'audit-log': { level: 'full' } }
   * });
   *
   * // Encryption plugin receives full record for encrypt/decrypt transforms
   * pgTable('secrets', { ... }).$cms({
   *   plugins: { encryption: { algorithm: 'aes-256-gcm' } }
   * });
   * ```
   */
  plugins?: Record<string, PluginColumnConfig>;
};

/** Symbol used to store CMS table options on Drizzle table objects. */
export const CMS_TABLE_OPTIONS: unique symbol = Symbol.for(
  'hotsauce-cms:tableOptions',
);
