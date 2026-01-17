// Handler types and options

import type { IntrospectedSchema, IntrospectedTable } from '@drizzle-cms/core';
import type { AuthProvider } from './auth/provider.ts';
import type { JwtPayload } from './auth/jwt.ts';

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
   * Must be at least 32 characters of entropy.
   * 
   * If not provided, falls back to CMS_CSRF_SECRET environment variable.
   * If neither is set, createCmsHandler() throws an error.
   * 
   * Generate with `openssl rand -base64 32` and store in an environment variable.
   * 
   * @example
   * ```ts
   * // Option 1: Pass directly
   * csrfSecret: process.env.CMS_CSRF_SECRET!,
   * 
   * // Option 2: Set CMS_CSRF_SECRET env var, omit from options
   * // createCmsHandler({ db, schema }) // uses CMS_CSRF_SECRET
   * ```
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
  /**
   * JWT authentication configuration (optional).
   * 
   * When provided, the CMS requires login to access.
   * Includes automatic /login and /logout routes.
   * 
   * @example
   * ```ts
   * auth: {
   *   secret: process.env.JWT_SECRET!,
   *   provider: new PasswordProvider({
   *     db,
   *     usersTable: schema.adminUsers,
   *     identityField: 'email',
   *     passwordField: 'passwordHash',
   *   }),
   * }
   * ```
   */
  auth?: CmsAuthOptions;
}

/**
 * JWT authentication options for CMS
 */
export interface CmsAuthOptions {
  /** 
   * Secret for signing JWTs (32+ characters).
   * 
   * If not provided, falls back to CMS_JWT_SECRET environment variable.
   * If neither is set, createCmsHandler() throws an error.
   */
  secret?: string;
  
  /** Auth provider for login (e.g., PasswordProvider) */
  provider: AuthProvider;
  
  /** Token lifetime in seconds (default: 8 hours) */
  maxAge?: number;
  
  /** Cookie name for JWT (default: 'cms_token') */
  cookieName?: string;
  
  /** Title shown on login page (default: 'Admin Login') */
  loginTitle?: string;
  
  /** Label for identity field (default: 'Email') */
  identityLabel?: string;
  
  /** 
   * Optional: Check if a token has been revoked.
   * Called on each request - implement blocklist here if needed.
   */
  isRevoked?: (payload: JwtPayload) => Promise<boolean> | boolean;
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
  /** JWT auth config (resolved) - undefined if auth disabled */
  auth?: ResolvedAuthOptions;
}

/**
 * Resolved auth options with defaults applied
 */
export interface ResolvedAuthOptions {
  secret: string;
  provider: AuthProvider;
  maxAge: number;
  cookieName: string;
  loginTitle: string;
  identityLabel: string;
  isRevoked?: (payload: JwtPayload) => Promise<boolean> | boolean;
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
  /** Authenticated user info (when auth is enabled) */
  authUser?: { id: string; role?: string };
}
