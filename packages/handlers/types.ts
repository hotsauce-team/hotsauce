// Handler types and options

import type { IntrospectedSchema, IntrospectedTable } from '@drizzle-cms/core';

/**
 * A Web Standard handler function: Request → Response
 */
export type Handler = (request: Request) => Promise<Response> | Response;

/**
 * Parser function signature (validation-library agnostic)
 * Takes unknown data and returns parsed/validated data or throws on error
 */
export type ParserFn = (data: unknown) => unknown;

/**
 * Parsers for a single table
 * Only insert and update are used - select validation is not needed for CMS
 */
export interface TableParsers {
  /** Parser for insert operations (new records) */
  insert?: ParserFn;
  /** Parser for update operations (existing records) */
  update?: ParserFn;
}

/**
 * User-provided parsers keyed by table name
 * If not provided for a table, drizzle-zod schemas are generated automatically
 */
export type Parsers = Record<string, TableParsers>;

/**
 * CRUD action types
 */
export type CrudAction = 'list' | 'read' | 'create' | 'update' | 'delete';

/**
 * Context passed to error handler
 */
export interface ErrorContext {
  /** The original request */
  request: Request;
  /** Parsed URL */
  url: URL;
  /** Route info (may be null if error occurred before routing) */
  route: ParsedRoute | null;
  /** The table being accessed (if any) */
  table?: IntrospectedTable;
  /** The action being performed (if any) */
  action?: CrudAction | 'dashboard';
}

/**
 * Options for creating the CMS handler
 */
export interface CmsOptions {
  /**
   * Drizzle database instance.
   * 
   * Uses `any` intentionally for cross-dialect compatibility (Postgres, MySQL, SQLite).
   * There's no common base type across Drizzle dialects, and importing all dialect types
   * would add dependencies.
   */
  // deno-lint-ignore no-explicit-any
  db: any;
  /** Drizzle schema object (e.g., { users, posts }) */
  // deno-lint-ignore no-explicit-any
  schema: Record<string, any>;
  /** Base path for CMS routes (default: '/admin') */
  basePath?: string;
  /** Site title for the admin UI */
  title?: string;
  /**
   * Secret for CSRF token signing (HMAC-SHA256).
   * Should be at least 32 bytes of entropy.
   * 
   * Generate with `generateCsrfSecret()` or use a secure environment variable.
   * If not provided, a random secret is generated (tokens won't survive restarts).
   */
  csrfSecret?: string;
  /** Custom authentication check */
  isAuthenticated?: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table */
  canAccess?: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
  /**
   * Error handler for unexpected errors.
   * 
   * Called when an unexpected error occurs (database failures, etc.).
   * Use this to log errors to your monitoring service (Sentry, Datadog, etc.).
   * The user receives a generic 500 response regardless.
   * 
   * @example
   * ```ts
   * onError: (error, context) => {
   *   logger.error('CMS error', {
   *     message: error.message,
   *     stack: error.stack,
   *     path: context.url.pathname,
   *     table: context.table?.name,
   *     action: context.action,
   *   });
   * }
   * ```
   */
  onError?: (error: Error, context: ErrorContext) => void;
  /**
   * Custom parsers for validation (optional).
   * 
   * If not provided, drizzle-zod schemas are generated automatically.
   * Use this to add custom validation rules (e.g., email format, min/max length).
   * 
   * @example
   * ```ts
   * parsers: {
   *   users: {
   *     insert: (data) => usersInsertSchema.parse(data),
   *     update: (data) => usersUpdateSchema.parse(data),
   *   }
   * }
   * ```
   */
  parsers?: Parsers;
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
  /** Secret for CSRF token signing */
  csrfSecret: string;
  /** Custom authentication check */
  isAuthenticated: (request: Request) => Promise<boolean> | boolean;
  /** Custom authorization check per table */
  canAccess: (request: Request, table: IntrospectedTable, action: CrudAction) => Promise<boolean> | boolean;
  /** Error handler for unexpected errors */
  onError?: (error: Error, context: ErrorContext) => void;
  /** Custom parsers for validation */
  parsers: Parsers;
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
