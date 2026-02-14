// Handler types and options

import type { IntrospectedSchema, IntrospectedTable } from '@hotsauce/core';
import type { AuthProvider, JwtPayload } from '@hotsauce/auth';
import type { Policies } from './policies/types.ts';
import type { PluginConfig } from './plugins/types.ts';
import type { PluginRegistry } from './plugins/registry.ts';
import type { PluginService } from './plugins/service.ts';

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
 * Base options shared by all CMS configurations
 */
export interface CmsOptionsBase {
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
  canAccess?: (
    request: Request,
    table: IntrospectedTable,
    action: CrudAction,
  ) => Promise<boolean> | boolean;
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
   * Plugins to extend CMS functionality.
   *
   * Plugins can provide UI customizations (custom field renderers),
   * data transformations, and action hooks.
   *
   * @example
   * ```ts
   * plugins: [
   *   { name: 'audit', worker: auditWorker, hooks: { on: ['create'] } },
   *   createPuckPlugin({ basePath: '/admin' }),
   * ]
   * ```
   */
  plugins?: PluginConfig[];
}

/**
 * CMS options with authentication enabled.
 *
 * @example
 * ```ts
 * createCmsHandler({
 *   db,
 *   schema,
 *   auth: { provider: new PasswordProvider({ db, usersTable: schema.adminUsers }) },
 *   policies: {
 *     posts: ownedBy(schema.posts, 'authorId'),
 *   },
 * });
 * ```
 */
export interface CmsOptionsWithAuth extends CmsOptionsBase {
  /**
   * JWT authentication configuration.
   *
   * When provided, the CMS requires login to access.
   * Includes automatic /login and /logout routes.
   */
  auth: CmsAuthOptions;

  /**
   * Row and column-level security policies (REQUIRED).
   *
   * You must explicitly choose an authorization strategy:
   * - `policies: { table: policy, ... }` - Apply row/column policies
   * - `policies: {}` - Full access for all authenticated users
   * - `policies: 'dangerously-open'` - Bypass all policy checks
   */
  policies: Policies | 'dangerously-open';
}

/**
 * CMS options without authentication.
 * Requires explicit acknowledgment that the CMS is open to anyone.
 */
export interface CmsOptionsWithoutAuth extends CmsOptionsBase {
  /**
   * Explicit acknowledgment that the CMS is open without authentication.
   *
   * This string literal forces developers to consciously opt-in to running
   * the CMS without any authentication, preventing accidental exposure.
   *
   * @example
   * ```ts
   * createCmsHandler({
   *   db,
   *   schema,
   *   auth: 'dangerously-open',
   *   policies: 'dangerously-open', // or policiesFromSchema(schema)
   * });
   * ```
   */
  auth: 'dangerously-open';

  /**
   * Row and column-level security policies (REQUIRED).
   *
   * Even without authentication, policies are required to make
   * authorization explicit. User-based policies (ownedBy, roleIs)
   * won't work since there's no `ctx.user`, but source-based
   * column policies (from `policiesFromSchema`) still work.
   *
   * Use `'dangerously-open'` to bypass all policy checks.
   */
  policies: Policies | 'dangerously-open';
}

/**
 * Options for creating the CMS handler.
 *
 * Both `auth` and `policies` are required to make security decisions explicit:
 * - `auth`: Either `{ provider: ... }` for login, or `'dangerously-open'`
 * - `policies`: Either `{ table: policy, ... }`, `{}`, or `'dangerously-open'`
 *
 * @example
 * ```ts
 * // With authentication
 * createCmsHandler({
 *   db, schema,
 *   auth: { provider: new PasswordProvider(...) },
 *   policies: { posts: ownedBy(schema.posts, 'authorId') },
 * });
 *
 * // Without authentication (internal tool)
 * createCmsHandler({
 *   db, schema,
 *   auth: 'dangerously-open',
 *   policies: 'dangerously-open',
 * });
 * ```
 */
export type CmsOptions = CmsOptionsWithAuth | CmsOptionsWithoutAuth;

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
  canAccess: (
    request: Request,
    table: IntrospectedTable,
    action: CrudAction,
  ) => Promise<boolean> | boolean;
  /** Error handler for unexpected errors */
  onError?: (error: Error, context: ErrorContext) => void;
  /** Custom parsers for validation */
  parsers: Parsers;
  /** Row-level security policies */
  policies: Policies;
  /** JWT auth config (resolved) - undefined if auth disabled */
  auth?: ResolvedAuthOptions;
  /** Plugin registry (undefined if no plugins configured) */
  plugins?: PluginRegistry;
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
  authUser?: { id: string; identity?: string; role?: string };
  /** Plugin service for executing hooks (when plugins configured) */
  pluginService?: PluginService;
}
