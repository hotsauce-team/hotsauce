// Plugin system types

import type { IntrospectedTable } from '@drizzle-cms/core';
import type { CrudAction } from '../types.ts';

/**
 * Context passed to plugin hooks for CRUD operations
 */
export interface PluginContext {
  /** The table being operated on */
  table: IntrospectedTable;
  /** The action being performed */
  action: CrudAction;
  /** Authenticated user info (when auth is enabled) */
  authUser?: { id: string; role?: string };
  /** The original request */
  request: Request;
  /** Drizzle database instance */
  // deno-lint-ignore no-explicit-any
  db: any;
}

/**
 * Context for before hooks - includes data to be inserted/updated
 */
export interface BeforeContext extends PluginContext {
  /** Data being inserted or updated */
  // deno-lint-ignore no-explicit-any
  data: Record<string, any>;
}

/**
 * Context for after hooks - includes the record and operation result
 */
export interface AfterContext extends PluginContext {
  /** The record that was created/updated/deleted */
  // deno-lint-ignore no-explicit-any
  record: Record<string, any>;
  /** For read operations, the record ID */
  recordId?: string;
}

/**
 * Plugin hook functions
 */
export interface PluginHooks {
  /** Called before creating a record */
  beforeCreate?: (ctx: BeforeContext) => Promise<void> | void;
  /** Called after creating a record */
  afterCreate?: (ctx: AfterContext) => Promise<void> | void;
  
  /** Called before updating a record */
  beforeUpdate?: (ctx: BeforeContext) => Promise<void> | void;
  /** Called after updating a record */
  afterUpdate?: (ctx: AfterContext) => Promise<void> | void;
  
  /** Called before deleting a record */
  beforeDelete?: (ctx: AfterContext) => Promise<void> | void;
  /** Called after deleting a record */
  afterDelete?: (ctx: AfterContext) => Promise<void> | void;
  
  /** Called before reading a record */
  beforeRead?: (ctx: PluginContext & { recordId: string }) => Promise<void> | void;
  /** Called after reading a record */
  afterRead?: (ctx: AfterContext) => Promise<void> | void;
  
  /** Called before listing records */
  beforeList?: (ctx: PluginContext) => Promise<void> | void;
  /** Called after listing records */
  afterList?: (ctx: PluginContext & { records: Record<string, unknown>[] }) => Promise<void> | void;
}

/**
 * Plugin interface
 */
export interface Plugin {
  /** Plugin name for debugging/identification */
  name: string;
  /** Plugin hooks */
  hooks: PluginHooks;
}

/**
 * Helper to create a plugin
 */
export function createPlugin(name: string, hooks: PluginHooks): Plugin {
  return { name, hooks };
}
