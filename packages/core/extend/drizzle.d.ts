// Type augmentations for Drizzle ORM column builders and tables.
// Adds $cms() method for attaching CMS metadata to columns and tables.

import type { CmsColumnOptions, CmsTableOptions } from './types.ts';

// ─────────────────────────────────────────────────────────────
// PostgreSQL
// ─────────────────────────────────────────────────────────────

declare module 'drizzle-orm/pg-core' {
  interface PgColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface PgTable {
    $cms(options: CmsTableOptions): this;
  }
}

// ─────────────────────────────────────────────────────────────
// SQLite
// ─────────────────────────────────────────────────────────────

declare module 'drizzle-orm/sqlite-core' {
  interface SQLiteColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface SQLiteTable {
    $cms(options: CmsTableOptions): this;
  }
}

// ─────────────────────────────────────────────────────────────
// MySQL
// ─────────────────────────────────────────────────────────────

declare module 'drizzle-orm/mysql-core' {
  interface MySqlColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
  interface MySqlTable {
    $cms(options: CmsTableOptions): this;
  }
}
