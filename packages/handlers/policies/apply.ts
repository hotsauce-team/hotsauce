// Policy application - core logic for applying policies to queries
// This module handles the integration between policies and Drizzle queries
// Includes both row-level filtering and column-level visibility/editability

import { and, eq, sql } from 'drizzle-orm';
import type { SQL, Table } from 'drizzle-orm';
import type { IntrospectedColumn, IntrospectedTable } from '@drizzle-cms/core';
import type { CrudAction } from '../types.ts';
import type {
  ActionPolicies,
  ColumnPolicies,
  Policy,
  PolicyApplicationResult,
  PolicyContext,
  PolicyFn,
  TablePolicy,
} from './types.ts';

// ============================================================================
// Type guards and helpers
// ============================================================================

/**
 * Check if a policy entry is a TablePolicy (has row or columns property)
 * vs a simple Policy (function or ActionPolicies)
 */
export function isTablePolicy(
  policy: Policy | TablePolicy | undefined,
): policy is TablePolicy {
  if (!policy || typeof policy === 'function') return false;

  // TablePolicy has 'row' or 'columns' property
  const asTable = policy as TablePolicy;
  return 'row' in asTable || 'columns' in asTable;
}

/**
 * Extract the row policy from a policy entry
 * Works with both simple Policy and TablePolicy
 */
export function extractRowPolicy(
  policyEntry: Policy | TablePolicy | undefined,
): Policy | undefined {
  if (!policyEntry) return undefined;
  if (isTablePolicy(policyEntry)) return policyEntry.row;
  return policyEntry;
}

/**
 * Extract column policies from a policy entry
 * Returns undefined if the entry is a simple Policy
 */
export function extractColumnPolicies(
  policyEntry: Policy | TablePolicy | undefined,
): ColumnPolicies | undefined {
  if (!policyEntry || !isTablePolicy(policyEntry)) return undefined;
  return policyEntry.columns;
}

// ============================================================================
// Row policy application
// ============================================================================

/**
 * Resolve a policy to a PolicyFn based on the action
 */
function resolvePolicyFn(
  policy: Policy,
  action: CrudAction,
): PolicyFn | undefined {
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
  const pkColumn = tableInfo.columns.find((c) => c.isPrimaryKey);
  if (!pkColumn) {
    throw new Error(`Table ${tableInfo.name} has no primary key`);
  }

  // deno-lint-ignore no-explicit-any
  const pkField =
    (table as unknown as Record<string, any>)[pkColumn.name] as SQL;
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
  const pkColumn = tableInfo.columns.find((c) => c.isPrimaryKey);
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
  const whereClause = buildPolicyWhere(
    table,
    tableInfo,
    recordId,
    policyCondition,
  );

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
  const whereClause = buildPolicyWhere(
    table,
    tableInfo,
    recordId,
    policyCondition,
  );

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
  const whereClause = buildPolicyWhere(
    table,
    tableInfo,
    recordId,
    policyCondition,
  );

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
    user: authUser
      ? {
        sub: authUser.id,
        role: authUser.role,
      }
      : undefined,
  };
}

// ============================================================================
// Column policy application
// ============================================================================

/**
 * Result of evaluating column policies for a table
 *
 * Contains lists of readable/writable columns and any default values
 * to inject for hidden required columns.
 */
export interface EvaluatedColumnPolicies {
  /** Columns the user can see (in list, detail, and forms) */
  readableColumns: string[];
  /** Columns the user can edit (in create/update forms) */
  writableColumns: string[];
  /** Default values to inject for non-writable columns on create */
  defaults: Record<string, unknown>;
}

/**
 * Evaluate column policies for a table
 *
 * Determines which columns are visible and editable for the current user.
 * Returns lists of column names and any default values to inject.
 *
 * Semantics:
 * - Columns without policies have full read/write access
 * - `read: false` → column excluded from readableColumns
 * - `write: false` → column excluded from writableColumns
 * - If `read` is false and `write` is undefined, write is also false
 * - Primary keys are always readable (needed for routing)
 *
 * @param columnPolicies - Column policies for the table (may be undefined)
 * @param columns - All columns from introspected table
 * @param ctx - Policy context with user info
 * @returns EvaluatedColumnPolicies with readable/writable columns and defaults
 *
 * @example
 * ```ts
 * const result = await evaluateColumnPolicies(
 *   policies.users?.columns,
 *   usersTable.columns,
 *   { user: { sub: 'user-1', role: 'editor' }, request }
 * );
 *
 * // result.readableColumns: ['id', 'name', 'email'] (salary hidden)
 * // result.writableColumns: ['name', 'email'] (id auto-gen, salary hidden)
 * // result.defaults: {} (no hidden required columns)
 * ```
 */
export async function evaluateColumnPolicies(
  columnPolicies: ColumnPolicies | undefined,
  columns: IntrospectedColumn[],
  ctx: PolicyContext,
): Promise<EvaluatedColumnPolicies> {
  const readableColumns: string[] = [];
  const writableColumns: string[] = [];
  const defaults: Record<string, unknown> = {};

  for (const col of columns) {
    const policy = columnPolicies?.[col.name];

    // No policy = full access
    if (!policy) {
      readableColumns.push(col.name);
      // Writable unless it's an auto-generated PK or timestamp
      if (!isAutoColumn(col)) {
        writableColumns.push(col.name);
      }
      continue;
    }

    // Evaluate read policy (default: true)
    const canRead = policy.read ? await policy.read(ctx) : true;

    // Primary keys are always readable (needed for routing/links)
    if (col.isPrimaryKey || canRead) {
      readableColumns.push(col.name);
    }

    // Evaluate write policy
    // Default: if read is explicitly false, write is also false
    // Otherwise, write defaults to true
    let canWrite: boolean;
    if (policy.write) {
      canWrite = await policy.write(ctx);
    } else if (policy.read && !canRead) {
      // read: false implies write: false when write is not specified
      canWrite = false;
    } else {
      canWrite = true;
    }

    // Skip auto-generated columns regardless of policy
    if (!isAutoColumn(col) && canWrite) {
      writableColumns.push(col.name);
    }

    // Collect default value for hidden/non-writable columns
    if (!canWrite && policy.default) {
      defaults[col.name] = await policy.default(ctx);
    }
  }

  return { readableColumns, writableColumns, defaults };
}

/**
 * Check if a column is auto-generated (shouldn't be in writable list)
 */
function isAutoColumn(col: IntrospectedColumn): boolean {
  // Auto-increment PK
  if (col.isPrimaryKey && col.hasDefault) return true;
  // Common timestamp columns
  if (col.name === 'created_at' || col.name === 'updated_at') return true;
  return false;
}

/**
 * Filter record data to only include readable columns
 *
 * Used to strip hidden columns from query results before sending to UI.
 * This ensures sensitive data never leaves the handler layer.
 *
 * @param record - Full record from database
 * @param readableColumns - Columns the user can see
 * @returns Record with only readable columns
 *
 * @example
 * ```ts
 * const fullRecord = { id: 1, name: 'John', salary: 100000, ssn: '123-45-6789' };
 * const filtered = filterRecordColumns(fullRecord, ['id', 'name']);
 * // { id: 1, name: 'John' }
 * ```
 */
export function filterRecordColumns(
  record: Record<string, unknown>,
  readableColumns: string[],
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const col of readableColumns) {
    if (col in record) {
      filtered[col] = record[col];
    }
  }
  return filtered;
}

/**
 * Filter multiple records to only include readable columns
 *
 * @param records - Array of records from database
 * @param readableColumns - Columns the user can see
 * @returns Records with only readable columns
 */
export function filterRecordsColumns(
  records: Record<string, unknown>[],
  readableColumns: string[],
): Record<string, unknown>[] {
  return records.map((r) => filterRecordColumns(r, readableColumns));
}

/**
 * Inject default values for non-writable columns
 *
 * Used during create operations to auto-fill columns that the user
 * cannot write to. This is required for NOT NULL columns without
 * database defaults, but also works for optional columns.
 *
 * @param formData - Data from form submission
 * @param defaults - Default values from column policies
 * @returns Form data with defaults merged in
 *
 * @example
 * ```ts
 * const formData = { name: 'New Post', title: 'Hello' };
 * const defaults = { tenant_id: 'tenant-123', created_by: 'user-456' };
 * const merged = injectColumnDefaults(formData, defaults);
 * // { name: 'New Post', title: 'Hello', tenant_id: 'tenant-123', created_by: 'user-456' }
 * ```
 */
export function injectColumnDefaults(
  formData: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  // Defaults are injected, but form data takes precedence if somehow present
  return { ...defaults, ...formData };
}

/**
 * Validation error for hidden required columns missing defaults
 */
export interface HiddenColumnError {
  /** Column name */
  column: string;
  /** Error message */
  message: string;
}

/**
 * Validate that all required columns are either writable or have defaults
 *
 * Called at runtime during create operations when we have actual user context.
 * Returns validation errors for any required columns that are:
 * - NOT NULL without database default
 * - Not writable by the current user (based on evaluated column policies)
 * - Missing a policy default value
 *
 * This catches configuration issues that can't be detected at startup
 * (because policies depend on runtime user context).
 *
 * @param columns - All columns from introspected table
 * @param columnResult - Evaluated column policies with writable columns and defaults
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * ```ts
 * const errors = validateHiddenRequiredColumns(table.columns, columnResult);
 * if (errors.length > 0) {
 *   // Return 400 with clear error message
 * }
 * ```
 */
export function validateHiddenRequiredColumns(
  columns: IntrospectedColumn[],
  columnResult: EvaluatedColumnPolicies,
): HiddenColumnError[] {
  const errors: HiddenColumnError[] = [];

  for (const col of columns) {
    // Skip if column has a database default
    if (col.hasDefault) continue;

    // Skip if column is nullable
    if (!col.notNull) continue;

    // Skip auto-generated columns
    if (isAutoColumn(col)) continue;

    // Check if column is writable by current user
    const isWritable = columnResult.writableColumns.includes(col.name);
    if (isWritable) continue;

    // Check if column has a policy default
    const hasDefault = col.name in columnResult.defaults;
    if (hasDefault) continue;

    // Required column is hidden without a default - this will fail on insert
    errors.push({
      column: col.name,
      message:
        `Column '${col.name}' is required (NOT NULL) but hidden from this user without a default. ` +
        `Either provide a 'default' function in the column policy, add a database default, ` +
        `or make the column nullable.`,
    });
  }

  return errors;
}
