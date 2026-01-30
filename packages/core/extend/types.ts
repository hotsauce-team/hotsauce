// Types for CMS-specific column metadata stored on Drizzle column builders/columns.

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
