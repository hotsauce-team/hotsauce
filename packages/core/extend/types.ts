// Types for CMS-specific column metadata stored on Drizzle column builders/columns.

export type CmsColumnOptions = {
  /** Treat this column as a file reference (UI: file input). */
  file?: boolean;
};
