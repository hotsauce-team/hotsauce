// Policy application - core logic for applying policies to queries
// This module handles the integration between policies and Drizzle queries

import { eq, and, sql } from 'drizzle-orm';
import type { SQL, Table } from 'drizzle-orm';
import type { IntrospectedTable } from '@drizzle-cms/core';
import type { CrudAction } from '../types.ts';
import type { 
  Policy, 
  PolicyFn, 
  ActionPolicies, 
  PolicyContext, 
  PolicyApplicationResult,
} from './types.ts';

/**
 * Resolve a policy to a PolicyFn based on the action
 */
function resolvePolicyFn(policy: Policy, action: CrudAction): PolicyFn | undefined {
  if (typeof policy === 'function') {
    return policy;
  }
  
  // Action-specific policies
  const actionPolicies = policy as ActionPolicies;
  return actionPolicies[action] ?? actionPolicies['*'];
}

/**
 * Apply a policy and get the result
 * 
 * @param policy - The policy to apply (or undefined if no policy)
 * @param ctx - Policy context with user info
 * @param action - The CRUD action being performed
 * @returns PolicyApplicationResult with allowed flag and optional SQL condition
 */
export async function applyPolicy(
  policy: Policy | undefined,
  ctx: PolicyContext,
  action: CrudAction,
): Promise<PolicyApplicationResult> {
  // No policy = full access
  if (!policy) {
    return { allowed: true };
  }
  
  const policyFn = resolvePolicyFn(policy, action);
  
  // No policy for this action = full access
  if (!policyFn) {
    return { allowed: true };
  }
  
  const result = await policyFn(ctx, action);
  
  // false = deny access
  if (result === false) {
    return { allowed: false };
  }
  
  // undefined = allow without filter
  if (result === undefined) {
    return { allowed: true };
  }
  
  // SQL condition = allow with filter
  return { allowed: true, condition: result };
}

/**
 * Build a WHERE clause that combines the policy condition with a record ID check
 * Used for read/update/delete operations on a specific record
 * 
 * @param table - The Drizzle table object
 * @param tableInfo - Introspected table metadata
 * @param recordId - The ID of the record being accessed
 * @param policyCondition - The SQL condition from the policy (if any)
 * @returns Combined SQL WHERE clause
 */
export function buildPolicyWhere(
  table: Table,
  tableInfo: IntrospectedTable,
  recordId: string,
  policyCondition?: SQL,
): SQL {
  // Find primary key column
  const pkColumn = tableInfo.columns.find(c => c.isPrimaryKey);
  if (!pkColumn) {
    throw new Error(`Table ${tableInfo.name} has no primary key`);
  }
  
  // deno-lint-ignore no-explicit-any
  const pkField = (table as unknown as Record<string, any>)[pkColumn.name] as SQL;
  const idCondition = eq(pkField as never, recordId as never);
  
  // Combine with policy condition if present
  if (policyCondition) {
    return and(idCondition, policyCondition) as SQL;
  }
  
  return idCondition as SQL;
}

/**
 * Check if a record exists without policy filter
 * Used to distinguish 404 (doesn't exist) from 403 (exists but denied)
 * 
 * @param db - Drizzle database instance
 * @param table - Drizzle table object
 * @param tableInfo - Introspected table metadata
 * @param recordId - Record ID to check
 * @returns true if record exists
 */
export async function recordExists(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: Table,
  tableInfo: IntrospectedTable,
  recordId: string,
): Promise<boolean> {
  const pkColumn = tableInfo.columns.find(c => c.isPrimaryKey);
  if (!pkColumn) {
    throw new Error(`Table ${tableInfo.name} has no primary key`);
  }
  
  // deno-lint-ignore no-explicit-any
  const pkField = (table as unknown as Record<string, any>)[pkColumn.name];
  
  const result = await db
    .select({ id: sql`1` })
    .from(table)
    .where(eq(pkField as never, recordId as never))
    .limit(1);
  
  return result.length > 0;
}

/**
 * Find a record with policy filter applied
 * Returns the record if found and accessible, null if filtered out
 * 
 * @param db - Drizzle database instance
 * @param table - Drizzle table object
 * @param tableInfo - Introspected table metadata
 * @param recordId - Record ID to fetch
 * @param policyCondition - Optional SQL condition from policy
 * @returns The record or null
 */
export async function findRecordWithPolicy(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: Table,
  tableInfo: IntrospectedTable,
  recordId: string,
  policyCondition?: SQL,
): Promise<Record<string, unknown> | null> {
  const whereClause = buildPolicyWhere(table, tableInfo, recordId, policyCondition);
  
  const results = await db
    .select()
    .from(table)
    .where(whereClause)
    .limit(1);
  
  return (results as Record<string, unknown>[])[0] ?? null;
}

/**
 * Execute an update with policy filter
 * Returns number of rows affected (0 if policy filtered it out)
 * 
 * @param db - Drizzle database instance
 * @param table - Drizzle table object
 * @param tableInfo - Introspected table metadata
 * @param recordId - Record ID to update
 * @param values - Values to update
 * @param policyCondition - Optional SQL condition from policy
 * @returns Number of rows updated
 */
export async function updateWithPolicy(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: Table,
  tableInfo: IntrospectedTable,
  recordId: string,
  values: Record<string, unknown>,
  policyCondition?: SQL,
): Promise<{ rowsAffected: number; record?: Record<string, unknown> }> {
  const whereClause = buildPolicyWhere(table, tableInfo, recordId, policyCondition);
  
  const result = await db
    .update(table)
    .set(values)
    .where(whereClause)
    .returning();
  
  return {
    rowsAffected: result.length,
    record: result[0] as Record<string, unknown> | undefined,
  };
}

/**
 * Execute a delete with policy filter
 * Returns number of rows affected (0 if policy filtered it out)
 * 
 * @param db - Drizzle database instance
 * @param table - Drizzle table object
 * @param tableInfo - Introspected table metadata
 * @param recordId - Record ID to delete
 * @param policyCondition - Optional SQL condition from policy
 * @returns Number of rows deleted
 */
export async function deleteWithPolicy(
  // deno-lint-ignore no-explicit-any
  db: any,
  table: Table,
  tableInfo: IntrospectedTable,
  recordId: string,
  policyCondition?: SQL,
): Promise<{ rowsAffected: number }> {
  const whereClause = buildPolicyWhere(table, tableInfo, recordId, policyCondition);
  
  const result = await db
    .delete(table)
    .where(whereClause)
    .returning();
  
  return { rowsAffected: result.length };
}

/**
 * Create a PolicyContext from route context
 * Extracts user info from JWT payload
 */
export function createPolicyContext(
  request: Request,
  authUser?: { id: string; role?: string },
): PolicyContext {
  return {
    request,
    user: authUser ? {
      sub: authUser.id,
      role: authUser.role,
    } : undefined,
  };
}
