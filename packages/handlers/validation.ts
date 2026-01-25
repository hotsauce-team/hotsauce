// Configuration validation using Zod
// Validates CmsOptions at startup and throws on invalid config

import { z } from 'zod';

/**
 * Zod schema for CmsOptions validation
 *
 * Validates configuration at startup to catch errors early.
 * Throws ZodError with detailed messages for invalid config.
 */
/**
 * Schema for auth configuration object (when not using 'dangerously-open')
 *
 * AuthProvider validation is minimal - we check that provider exists and has
 * an authenticate method. Full validation would require runtime testing.
 */
const AuthConfigSchema = z.object({
  provider: z.any().refine(
    (val) =>
      val != null &&
      typeof val === 'object' &&
      typeof val.authenticate === 'function',
    {
      message:
        'auth.provider must be an AuthProvider with an authenticate() method',
    },
  ),
  secret: z.string().min(32, {
    message: 'auth.secret must be at least 32 characters for security',
  }).optional(),
  maxAge: z.number().positive().optional(),
  cookieName: z.string().optional(),
  loginTitle: z.string().optional(),
  identityLabel: z.string().optional(),
  isRevoked: z.any().optional(),
});

/**
 * Schema for policies: either 'dangerously-open' literal or an object (can be empty for full access)
 */
const PoliciesSchema = z.union([
  z.literal('dangerously-open'),
  z.any().refine(
    (val) => val != null && typeof val === 'object',
    { message: 'policies must be an object or "dangerously-open"' },
  ),
], {
  message:
    "policies is required when auth is configured: provide table policies or 'dangerously-open' to bypass",
});

/**
 * Base schema fields shared by all configurations
 */
const BaseOptionsSchema = z.object({
  // Required fields
  db: z.any().refine(
    (val) => val != null && typeof val === 'object',
    { message: 'db is required and must be a Drizzle database instance' },
  ),
  // Use z.any() for schema since Drizzle schemas have Symbol keys (e.g., Symbol.toStringTag)
  // that z.record(z.string(), z.any()) rejects
  schema: z.any().refine(
    (val) =>
      val != null && typeof val === 'object' && Object.keys(val).length > 0,
    { message: 'schema must be an object with at least one table' },
  ),
  // Optional fields with validation
  basePath: z.string()
    .regex(/^\//, { message: 'basePath must start with /' })
    .optional(),
  title: z.string()
    .min(1, { message: 'title cannot be empty' })
    .max(100, { message: 'title must be 100 characters or less' })
    .optional(),
  csrfSecret: z.string()
    .min(32, {
      message: 'csrfSecret must be at least 32 characters for security',
    })
    .optional(),
  // Functions validated as 'any' since Zod's function validation is complex
  // Runtime will fail anyway if these aren't callable
  isAuthenticated: z.any().optional(),
  canAccess: z.any().optional(),
  onError: z.any().optional(),
});

/**
 * Schema for CMS with auth: 'dangerously-open' (policies must NOT be set)
 */
const DangerouslyOpenAuthSchema = BaseOptionsSchema.extend({
  auth: z.literal('dangerously-open'),
  policies: z.undefined({
    message:
      "policies must not be set when auth is 'dangerously-open' (no user context for policies)",
  }),
});

/**
 * Schema for CMS with auth config (policies required)
 */
const AuthenticatedSchema = BaseOptionsSchema.extend({
  auth: AuthConfigSchema,
  policies: PoliciesSchema,
});

/**
 * Combined schema: validates based on auth type
 *
 * Uses check() to route to the correct schema based on auth value,
 * providing better error messages than a plain union.
 */
export const CmsOptionsSchema = z.any().check((ctx) => {
  const data = ctx.value;

  if (data == null || typeof data !== 'object') {
    ctx.issues.push({
      code: 'custom',
      message: 'Configuration must be an object',
      input: data,
      path: [],
    });
    return;
  }

  // Route to correct schema based on auth value
  if (data.auth === 'dangerously-open') {
    const result = DangerouslyOpenAuthSchema.safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.issues.push({ ...issue, input: data });
      }
    }
    return;
  }

  // Auth is object or undefined - validate with AuthenticatedSchema
  const result = AuthenticatedSchema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.issues.push({ ...issue, input: data });
    }
  }
});

/**
 * Schema for resolved secrets (after env var fallback).
 * Used internally after resolving CMS_JWT_SECRET and CMS_CSRF_SECRET.
 */
export const ResolvedSecretsSchema = z.object({
  csrfSecret: z.string().min(32, {
    message: 'csrfSecret must be at least 32 characters. ' +
      'Either pass csrfSecret directly or set CMS_CSRF_SECRET environment variable. ' +
      'Generate one with: openssl rand -base64 32',
  }),
  authSecret: z.string().min(32, {
    message: 'auth.secret must be at least 32 characters. ' +
      'Either pass auth.secret directly or set CMS_JWT_SECRET environment variable.',
  }).optional(),
});

/**
 * Custom error class for CMS configuration errors
 */
export class CmsConfigError extends Error {
  constructor(message: string, public details?: z.ZodError) {
    super(message);
    this.name = 'CmsConfigError';
  }
}

/**
 * Validate CmsOptions and throw on invalid configuration
 *
 * @throws {CmsConfigError} When configuration is invalid
 */
export function validateCmsOptions(options: unknown): void {
  const result = CmsOptionsSchema.safeParse(options);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        // Zod paths can contain Symbols (from object keys), which throw on join()
        const path = issue.path
          .map((p) =>
            typeof p === 'symbol' ? (p.description ?? 'symbol') : String(p)
          )
          .join('.');
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new CmsConfigError(
      `Invalid CMS configuration:\n${issues}`,
      result.error,
    );
  }
}

/**
 * Validate resolved secrets (after env var fallback)
 * Returns the validated secrets with proper types (csrfSecret is guaranteed defined)
 *
 * @throws {CmsConfigError} When secrets are missing or invalid
 */
export function validateResolvedSecrets(secrets: {
  csrfSecret: string | undefined;
  authSecret: string | undefined;
}): { csrfSecret: string; authSecret: string | undefined } {
  const result = ResolvedSecretsSchema.safeParse(secrets);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new CmsConfigError(
      `Invalid CMS configuration:\n${issues}`,
      result.error,
    );
  }

  return result.data as { csrfSecret: string; authSecret: string | undefined };
}

// ============================================================================
// Column Policy Validation
// ============================================================================

import type { IntrospectedColumn, IntrospectedTable } from '@drizzle-cms/core';
import type { ColumnPolicies, Policies } from './policies/types.ts';
import { extractColumnPolicies } from './policies/apply.ts';

/**
 * Check if a column is required (NOT NULL without a default)
 */
function isRequiredColumn(col: IntrospectedColumn): boolean {
  return col.notNull && !col.hasDefault;
}

/**
 * Check if a column is auto-generated (shouldn't be manually filled)
 */
function isAutoGeneratedColumn(col: IntrospectedColumn): boolean {
  // Auto-increment PK
  if (col.isPrimaryKey && col.hasDefault) return true;
  // Common timestamp columns
  if (col.name === 'created_at' || col.name === 'updated_at') return true;
  return false;
}

/**
 * Validate column policies for a table
 *
 * Ensures that hidden required columns have default values configured.
 * This prevents insert failures when required columns are hidden from users.
 *
 * @param tableName - Name of the table being validated
 * @param columns - Introspected columns from the table
 * @param columnPolicies - Column policies defined for this table
 * @returns Array of validation error messages (empty if valid)
 *
 * @example
 * ```ts
 * const errors = validateTableColumnPolicies('users', usersColumns, {
 *   tenant_id: { read: () => false }, // Error: required column hidden without default
 * });
 * ```
 */
export function validateTableColumnPolicies(
  tableName: string,
  columns: IntrospectedColumn[],
  columnPolicies: ColumnPolicies | undefined,
): string[] {
  if (!columnPolicies) return [];

  const errors: string[] = [];

  for (const col of columns) {
    const policy = columnPolicies[col.name];
    if (!policy) continue;

    // Skip auto-generated columns (they're never user-editable anyway)
    if (isAutoGeneratedColumn(col)) continue;

    // Check if column is hidden from writing
    // A column is hidden from writing if:
    // 1. write: () => false explicitly, OR
    // 2. read: () => false without a write policy (implied)
    const hasExplicitWrite = policy.write !== undefined;
    const hasExplicitRead = policy.read !== undefined;

    // If there's an explicit write policy, we need to evaluate it at config time
    // Since we don't have a user context, we check if the policy ALWAYS returns false
    // This is a heuristic - we assume if `write: () => false`, it's always false
    const isAlwaysFalseWrite = hasExplicitWrite &&
      policy.write?.toString().includes('false');
    const isAlwaysFalseRead = hasExplicitRead &&
      policy.read?.toString().includes('false');

    // Column is potentially hidden from writing
    const isPotentiallyHiddenFromWriting =
      isAlwaysFalseWrite || (isAlwaysFalseRead && !hasExplicitWrite);

    // If column is required AND potentially hidden AND no default provided
    if (
      isRequiredColumn(col) &&
      isPotentiallyHiddenFromWriting &&
      !policy.default
    ) {
      errors.push(
        `Column '${col.name}' in table '${tableName}' is required (NOT NULL without default) ` +
          `but hidden from writing without a policy default. ` +
          `Either provide a 'default' function in the column policy, ` +
          `add a database default, or make the column nullable.`,
      );
    }
  }

  return errors;
}

/**
 * Validate all column policies across all tables
 *
 * Called at startup to catch configuration errors early.
 * Throws CmsConfigError with detailed messages for all violations.
 *
 * @param tables - All introspected tables
 * @param policies - Policies configuration
 * @throws {CmsConfigError} When column policies are invalid
 *
 * @example
 * ```ts
 * // In createCmsHandler:
 * validateColumnPolicies(introspected.tables, options.policies);
 * ```
 */
export function validateColumnPolicies(
  tables: IntrospectedTable[],
  policies: Policies | undefined,
): void {
  if (!policies) return;

  const allErrors: string[] = [];

  for (const table of tables) {
    const tablePolicy = policies[table.name];
    const columnPolicies = extractColumnPolicies(tablePolicy);

    const errors = validateTableColumnPolicies(
      table.name,
      table.columns,
      columnPolicies,
    );

    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    throw new CmsConfigError(
      `Invalid column policies:\n${allErrors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}
