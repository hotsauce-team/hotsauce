/**
 * @module
 *
 * Extends Drizzle column builders and tables with a `$cms()` method.
 *
 * This module patches Drizzle's builder prototypes (Pg/SQLite/MySQL)
 * so schema definitions can attach CMS metadata that flows from builder → column.
 * It also patches table classes to allow table-level CMS configuration.
 *
 * For TypeScript support, users must add type declarations to their project.
 * See README or copy from extend/drizzle.d.ts.
 *
 * @example
 * ```ts
 * import "@hotsauce/core/extend";
 *
 * const posts = pgTable("posts", {
 *   content: text("content").$cms({ widget: "richtext" }),
 *   avatar: text("avatar").$cms({ file: { accept: "image/*" } }),
 * });
 * ```
 */

import { MySqlColumnBuilder } from 'drizzle-orm/mysql-core';
import { PgColumnBuilder } from 'drizzle-orm/pg-core';
import { SQLiteColumnBuilder } from 'drizzle-orm/sqlite-core';

// Table classes
import { PgTable } from 'drizzle-orm/pg-core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { MySqlTable } from 'drizzle-orm/mysql-core';

import type { CmsColumnOptions, CmsTableOptions } from './types.ts';
import { CMS_TABLE_OPTIONS } from './types.ts';

// ─────────────────────────────────────────────────────────────
// Column builder prototype patch
// ─────────────────────────────────────────────────────────────

function defineCmsMethod(proto: object): void {
  // deno-lint-ignore no-explicit-any
  const protoAny = proto as any;
  if (typeof protoAny.$cms === 'function') return;

  Object.defineProperty(protoAny, '$cms', {
    value: function $cms(this: unknown, options: CmsColumnOptions): unknown {
      // deno-lint-ignore no-explicit-any
      const self = this as any;
      const config = self?.config;
      if (!config || typeof config !== 'object') {
        throw new Error('HotSauce CMS: column builder has no config object');
      }

      const current = (config.cmsOptions ?? {}) as Record<string, unknown>;
      config.cmsOptions = {
        ...current,
        ...(options as Record<string, unknown>),
      };
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

defineCmsMethod(PgColumnBuilder.prototype);
defineCmsMethod(SQLiteColumnBuilder.prototype);
defineCmsMethod(MySqlColumnBuilder.prototype);

// ─────────────────────────────────────────────────────────────
// Table prototype patch
// ─────────────────────────────────────────────────────────────

function defineTableCmsMethod(proto: object): void {
  // deno-lint-ignore no-explicit-any
  const protoAny = proto as any;
  if (typeof protoAny.$cms === 'function') return;

  Object.defineProperty(protoAny, '$cms', {
    value: function $cms(this: unknown, options: CmsTableOptions): unknown {
      // Store options on the table instance using our symbol
      // deno-lint-ignore no-explicit-any
      (this as any)[CMS_TABLE_OPTIONS] = options;
      return this;
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

defineTableCmsMethod(PgTable.prototype);
defineTableCmsMethod(SQLiteTable.prototype);
defineTableCmsMethod(MySqlTable.prototype);

export type {
  CmsColumnOptions,
  CmsTableOptions,
  FileReference,
  FrontendUrlFn,
} from './types.ts';
export { CMS_TABLE_OPTIONS } from './types.ts';
