// Policy types for row-level security style authorization
// Policies return Drizzle SQL conditions that are applied to queries

import type { SQL } from 'drizzle-orm';
import type { CrudAction } from '../types.ts';

/**
 * Context passed to policy functions
 * Contains the authenticated user and request metadata
 */
export interface PolicyContext {
  /** Authenticated user from JWT (undefined if not using auth) */
  user?: {
    /** User ID from JWT subject claim */
    sub: string;
    /** User role from JWT (if provided) */
    role?: string;
  };
  /** The original request (for advanced use cases) */
  request: Request;
}

/**
 * Result from a policy function:
 * - `SQL` condition: Filter is applied to query (e.g., `WHERE author_id = 'user-123'`)
 * - `undefined`: No filter applied (full access)
 * - `false`: Access denied (returns 403)
 *
 * Note: Returning `sql\`false\`` filters all rows (0 results).
 * Returning the literal `false` value immediately denies access with 403.
 */
export type PolicyResult = SQL | undefined | false;

/**
 * Policy function signature
 *
 * @param ctx - Context with authenticated user info
 * @param action - The CRUD action being performed
 * @returns SQL condition, undefined (no filter), or false (deny)
 *
 * @example
 * ```ts
 * const postsPolicy: PolicyFn = (ctx, action) => {
 *   if (ctx.user?.role === 'admin') return undefined; // No filter
 *   if (!ctx.user) return false; // Deny access
 *   return eq(posts.authorId, ctx.user.sub); // Filter to owned
 * };
 * ```
 */
export type PolicyFn = (
  ctx: PolicyContext,
  action: CrudAction,
) => PolicyResult | Promise<PolicyResult>;

/**
 * Action-specific policy object
 * Define different policies for different CRUD actions
 *
 * @example
 * ```ts
 * const postsPolicy: ActionPolicies = {
 *   list: (ctx) => eq(posts.status, 'published'),
 *   read: (ctx) => eq(posts.status, 'published'),
 *   create: (ctx) => ctx.user ? undefined : false,
 *   update: (ctx) => eq(posts.authorId, ctx.user?.sub ?? ''),
 *   delete: (ctx) => ctx.user?.role === 'admin' ? undefined : false,
 * };
 * ```
 */
export type ActionPolicies =
  & {
    [K in CrudAction]?: PolicyFn;
  }
  & {
    /** Fallback policy for actions not explicitly defined */
    '*'?: PolicyFn;
  };

/**
 * Policy definition - either a single function or action-specific policies
 */
export type Policy = PolicyFn | ActionPolicies;

/**
 * Policies configuration keyed by table name
 *
 * @example
 * ```ts
 * const policies: Policies = {
 *   posts: (ctx, action) => {
 *     if (ctx.user?.role === 'admin') return undefined;
 *     return eq(posts.authorId, ctx.user?.sub ?? '');
 *   },
 *   comments: {
 *     list: () => undefined, // Anyone can list
 *     create: (ctx) => ctx.user ? undefined : false,
 *     update: (ctx) => eq(comments.userId, ctx.user?.sub ?? ''),
 *     delete: (ctx) => eq(comments.userId, ctx.user?.sub ?? ''),
 *   },
 *   // audit_logs: not defined = full access
 * };
 * ```
 */
export type Policies = Record<string, Policy>;

/**
 * Result of applying a policy to determine access
 */
export interface PolicyApplicationResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** SQL condition to apply to query (if allowed and has filter) */
  condition?: SQL;
}
