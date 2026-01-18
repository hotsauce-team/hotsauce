// Policy helper factories for common authorization patterns
// These reduce boilerplate for typical use cases

import { eq, or, and, arrayContains, isNotNull } from 'drizzle-orm';
import type { SQL, Table, Column } from 'drizzle-orm';
import type { PolicyFn, ActionPolicies } from './types.ts';


// ============================================================================
// Core helpers
// ============================================================================

/**
 * Always allow access (no filter applied)
 * 
 * @example
 * ```ts
 * const policies = {
 *   public_posts: always(), // Everyone has full access
 * };
 * ```
 */
export function always(): PolicyFn {
  return () => undefined;
}

/**
 * Always deny access (returns 403 Forbidden)
 * 
 * @example
 * ```ts
 * const policies = {
 *   secrets: never(), // No one can access
 * };
 * ```
 */
export function never(): PolicyFn {
  return () => false;
}

/**
 * Require authentication (any logged-in user)
 * 
 * @example
 * ```ts
 * const policies = {
 *   drafts: authenticated(), // Must be logged in
 * };
 * ```
 */
export function authenticated(): PolicyFn {
  return (ctx) => ctx.user ? undefined : false;
}

// ============================================================================
// Role-based helpers
// ============================================================================

/**
 * Only allow users with a specific role
 * 
 * @param role - Required role
 * @param policy - Policy to apply if role matches (default: always())
 * 
 * @example
 * ```ts
 * const policies = {
 *   settings: roleIs('admin'),
 *   posts: roleIs('admin', always()), // Explicit: admin has full access
 * };
 * ```
 */
export function roleIs(role: string, policy: PolicyFn = always()): PolicyFn {
  return (ctx, action) => {
    if (ctx.user?.role === role) {
      return policy(ctx, action);
    }
    return false;
  };
}

/**
 * Allow users with any of the specified roles
 * 
 * @param roles - Array of allowed roles
 * @param policy - Policy to apply if any role matches
 * 
 * @example
 * ```ts
 * const policies = {
 *   posts: roleIn(['admin', 'editor']),
 * };
 * ```
 */
export function roleIn(roles: string[], policy: PolicyFn = always()): PolicyFn {
  return (ctx, action) => {
    if (ctx.user?.role && roles.includes(ctx.user.role)) {
      return policy(ctx, action);
    }
    return false;
  };
}

// ============================================================================
// Ownership helpers
// ============================================================================

/**
 * Filter to records owned by the current user
 * Compares table column to JWT subject (user ID)
 * 
 * @param table - Drizzle table object
 * @param ownerColumn - Column name containing owner user ID
 * 
 * @example
 * ```ts
 * import { posts } from './schema';
 * 
 * const policies = {
 *   posts: ownedBy(posts, 'authorId'),
 * };
 * ```
 */
export function ownedBy<T extends Table>(
  table: T,
  ownerColumn: keyof T & string,
): PolicyFn {
  return (ctx) => {
    if (!ctx.user) return false;
    const column = table[ownerColumn] as Column;
    return eq(column, ctx.user.sub);
  };
}

/**
 * Filter to records where user is owner OR a contributor
 * Works with tables that have an owner column and a contributors array column
 * 
 * @param table - Drizzle table object
 * @param ownerColumn - Column name containing owner user ID
 * @param contributorsColumn - Column name containing array of contributor user IDs
 * 
 * @example
 * ```ts
 * import { posts } from './schema';
 * 
 * const policies = {
 *   // posts.contributors is text[]
 *   posts: ownedByOrContributor(posts, 'authorId', 'contributors'),
 * };
 * ```
 */
export function ownedByOrContributor<T extends Table>(
  table: T,
  ownerColumn: keyof T & string,
  contributorsColumn: keyof T & string,
): PolicyFn {
  return (ctx) => {
    if (!ctx.user) return false;
    const owner = table[ownerColumn] as Column;
    const contributors = table[contributorsColumn] as Column;
    
    return or(
      eq(owner, ctx.user.sub),
      and(
        isNotNull(contributors),
        arrayContains(contributors, [ctx.user.sub])
      )
    ) as SQL;
  };
}

// ============================================================================
// Combining policies
// ============================================================================

/**
 * Apply the first policy that grants access
 * Useful for "admin OR owner" patterns
 * 
 * @param policies - Array of policies to try in order
 * 
 * @example
 * ```ts
 * const policies = {
 *   posts: anyOf([
 *     roleIs('admin'),           // Admins have full access
 *     ownedBy(posts, 'authorId'), // Others only see their own
 *   ]),
 * };
 * ```
 */
export function anyOf(policies: PolicyFn[]): PolicyFn {
  return async (ctx, action) => {
    const conditions: SQL[] = [];
    
    for (const policy of policies) {
      const result = await policy(ctx, action);
      
      // If any policy grants full access, grant it
      if (result === undefined) {
        return undefined;
      }
      
      // If policy returns a condition, collect it
      if (result !== false) {
        conditions.push(result);
      }
    }
    
    // If no policies granted access, deny
    if (conditions.length === 0) {
      return false;
    }
    
    // Combine all conditions with OR
    if (conditions.length === 1) {
      return conditions[0];
    }
    
    return or(...conditions) as SQL;
  };
}

/**
 * Require ALL policies to grant access
 * Useful for combining multiple conditions
 * 
 * @param policies - Array of policies that must all pass
 * 
 * @example
 * ```ts
 * const policies = {
 *   posts: allOf([
 *     authenticated(),
 *     ownedBy(posts, 'authorId'),
 *   ]),
 * };
 * ```
 */
export function allOf(policies: PolicyFn[]): PolicyFn {
  return async (ctx, action) => {
    const conditions: SQL[] = [];
    
    for (const policy of policies) {
      const result = await policy(ctx, action);
      
      // If any policy denies, deny
      if (result === false) {
        return false;
      }
      
      // Collect non-undefined conditions
      if (result !== undefined) {
        conditions.push(result);
      }
    }
    
    // If no conditions, grant full access
    if (conditions.length === 0) {
      return undefined;
    }
    
    // Combine all conditions with AND
    if (conditions.length === 1) {
      return conditions[0];
    }
    
    return and(...conditions) as SQL;
  };
}

// ============================================================================
// Action-specific helpers
// ============================================================================

/**
 * Apply different policies for different actions
 * 
 * @param actionPolicies - Object mapping actions to policies
 * 
 * @example
 * ```ts
 * const policies = {
 *   posts: forActions({
 *     list: always(),
 *     read: always(),
 *     create: authenticated(),
 *     update: ownedBy(posts, 'authorId'),
 *     delete: roleIs('admin'),
 *   }),
 * };
 * ```
 */
export function forActions(actionPolicies: ActionPolicies): PolicyFn {
  return (ctx, action) => {
    const policy = actionPolicies[action] ?? actionPolicies['*'];
    
    if (!policy) {
      // No policy for this action = full access
      return undefined;
    }
    
    return policy(ctx, action);
  };
}

/**
 * Read-only access: allow list and read, deny create/update/delete
 * 
 * @param readPolicy - Policy for list/read actions (default: always())
 * 
 * @example
 * ```ts
 * const policies = {
 *   audit_logs: readOnly(),
 *   public_posts: readOnly(), // Anyone can read, no one can modify
 * };
 * ```
 */
export function readOnly(readPolicy: PolicyFn = always()): PolicyFn {
  return forActions({
    list: readPolicy,
    read: readPolicy,
    create: never(),
    update: never(),
    delete: never(),
  });
}

/**
 * Common pattern: admins have full access, others need to pass a policy
 * 
 * @param otherPolicy - Policy for non-admin users
 * @param adminRole - Role that gets full access (default: 'admin')
 * 
 * @example
 * ```ts
 * const policies = {
 *   posts: adminOr(ownedBy(posts, 'authorId')),
 *   settings: adminOr(never()), // Only admins can access
 * };
 * ```
 */
export function adminOr(otherPolicy: PolicyFn, adminRole = 'admin'): PolicyFn {
  return anyOf([
    roleIs(adminRole),
    otherPolicy,
  ]);
}
