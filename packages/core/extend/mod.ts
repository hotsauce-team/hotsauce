// Extends Drizzle column builders with a `$cms()` method.
//
// This module intentionally patches Drizzle's builder prototypes (Pg/SQLite/MySQL)
// so schema definitions can attach CMS metadata that flows from builder → column.

import { MySqlColumnBuilder } from 'drizzle-orm/mysql-core';
import { PgColumnBuilder } from 'drizzle-orm/pg-core';
import { SQLiteColumnBuilder } from 'drizzle-orm/sqlite-core';

import type { CmsColumnOptions } from './types.ts';

declare module 'drizzle-orm/pg-core' {
  interface PgColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
}

declare module 'drizzle-orm/sqlite-core' {
  interface SQLiteColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
}

declare module 'drizzle-orm/mysql-core' {
  interface MySqlColumnBuilder {
    $cms(options: CmsColumnOptions): this;
  }
}

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
        throw new Error('Drizzle CMS: column builder has no config object');
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

export type { CmsColumnOptions } from './types.ts';
