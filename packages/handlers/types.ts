// Handler types and options

import type { IntrospectedSchema, IntrospectedTable } from '@drizzle-cms/core';

/**
 * A Web Standard handler function: Request → Response
 */
export type Handler = (request: Request) => Promise<Response> | Response;

/**
 * CRUD action types
 */
export type CrudAction = 'list' | 'read' | 'create' | 'update' | 'delete';

/**
 * Options for creating the CMS handler
 */
export interface CmsOptions {
  /** Drizzle database instance */
  // deno-lint-ignore no-explicit-any
  db: any;
  /** Drizzle schema object (e.g., { users, posts }) */
  // deno-lint-ignore no-explicit-any
  schema: Record<string, any>;
  /** Base path for CMS routes (default: '/admin') */
  basePath?: string;
  /** Site title for the admin UI */
  title?: string;
  /** Custom authentication check */
  isAuthenticated?: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table */
  canAccess?: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
}

/**
 * Internal options after introspection
 */
export interface ResolvedCmsOptions {
  /** Introspected schema */
  introspected: IntrospectedSchema;
  /** Drizzle database instance */
  // deno-lint-ignore no-explicit-any
  db: any;
  /** Base path for CMS routes */
  basePath: string;
  /** Site title for the admin UI */
  title: string;
  /** Custom authentication check */
  isAuthenticated: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table */
  canAccess: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
}

/**
 * Parsed route information
 */
export interface ParsedRoute {
  /** The matched table, or null for dashboard */
  table: IntrospectedTable | null;
  /** The CRUD action to perform */
  action: CrudAction | 'dashboard';
  /** Record ID for read/update/delete actions */
  recordId?: string;
}

/**
 * Flash message for user feedback
 */
export interface FlashMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

/**
 * Context passed to route handlers
 */
export interface RouteContext {
  request: Request;
  options: ResolvedCmsOptions;
  route: ParsedRoute;
  url: URL;
  flash?: FlashMessage;
}
