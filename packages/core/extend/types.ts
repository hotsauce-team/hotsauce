// Types for CMS-specific metadata stored on Drizzle column builders/columns and tables.

// ─────────────────────────────────────────────────────────────
// Column-level CMS options
// ─────────────────────────────────────────────────────────────

/**
 * Options for customizing how a column appears in the CMS.
 * Applied via `column.$cms({ ... })` method.
 */
export type CmsColumnOptions = {
  /** Treat this column as a file reference (UI: file input). */
  file?: boolean;
  /** MIME type filter for file input (default: 'image/*'). Only used when file: true. */
  accept?: string;
  /** Maximum file size in bytes (default: 200000 = 200KB). Only used when file: true. */
  maxSize?: number;
  /** Hide this field from all CMS views (forms, lists, detail). Still saved to DB. */
  hidden?: boolean;
  /** Show this field but prevent editing. */
  readOnly?: boolean;
  /** Plugin-specific configuration, keyed by plugin name. */
  plugins?: Record<string, unknown>;
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
};

/**
 * Runtime check for valid FileReference shape.
 * Defensive check for data that may have been inserted outside CMS.
 */
export function isValidFileReference(value: unknown): value is FileReference {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.filename === 'string' &&
    typeof obj.contentType === 'string' &&
    typeof obj.size === 'number'
  );
}

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
};

/** Symbol used to store CMS table options on Drizzle table objects. */
export const CMS_TABLE_OPTIONS: unique symbol = Symbol.for(
  'hotsauce-cms:tableOptions',
);
