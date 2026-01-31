// Policy module entry point
// Re-exports all policy types, helpers, and application functions

// ─────────────────────────────────────────────────────────────
// Types - Policy definitions and results
// ─────────────────────────────────────────────────────────────
export type {
  ActionPolicies,
  // Column-level policies
  ColumnPolicies,
  ColumnPolicy,
  ColumnPolicyFn,
  // Row-level policies
  Policies,
  Policy,
  PolicyApplicationResult,
  PolicyContext,
  PolicyFn,
  PolicyResult,
  // Table policy (combines row + column)
  TablePolicy,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Helpers - Factory functions for common policy patterns
// ─────────────────────────────────────────────────────────────
export {
  adminOr,
  allOf,
  // Core
  always,
  // Combining
  anyOf,
  authenticated,
  // Action-specific
  forActions,
  never,
  // Ownership
  ownedBy,
  ownedByOrContributor,
  readOnly,
  roleIn,
  // Role-based
  roleIs,
} from './helpers.ts';

// ─────────────────────────────────────────────────────────────
// Row Policy Application - Apply row policies to queries
// ─────────────────────────────────────────────────────────────
export {
  applyPolicy,
  buildPolicyWhere,
  createPolicyContext,
  deleteWithPolicy,
  findRecordWithPolicy,
  recordExists,
  updateWithPolicy,
} from './apply.ts';

// ─────────────────────────────────────────────────────────────
// Column Policy Application - Apply column policies to filter fields
// ─────────────────────────────────────────────────────────────
export type { EvaluatedColumnPolicies, HiddenColumnError } from './apply.ts';
export {
  evaluateColumnPolicies,
  extractColumnPolicies,
  extractRowPolicy,
  filterRecordColumns,
  filterRecordsColumns,
  injectColumnDefaults,
  isTablePolicy,
  validateHiddenRequiredColumns,
} from './apply.ts';
