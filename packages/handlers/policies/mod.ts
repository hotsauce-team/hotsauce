// Policy module entry point
// Re-exports all policy types, helpers, and application functions

// ─────────────────────────────────────────────────────────────
// Types - Policy definitions and results
// ─────────────────────────────────────────────────────────────
export type {
  PolicyContext,
  PolicyResult,
  PolicyFn,
  ActionPolicies,
  Policy,
  Policies,
  PolicyApplicationResult,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Helpers - Factory functions for common policy patterns
// ─────────────────────────────────────────────────────────────
export {
  // Core
  always,
  never,
  authenticated,
  // Role-based
  roleIs,
  roleIn,
  // Ownership
  ownedBy,
  ownedByOrContributor,
  // Combining
  anyOf,
  allOf,
  // Action-specific
  forActions,
  readOnly,
  adminOr,
} from './helpers.ts';

// ─────────────────────────────────────────────────────────────
// Application - Apply policies to queries
// ─────────────────────────────────────────────────────────────
export {
  applyPolicy,
  buildPolicyWhere,
  recordExists,
  findRecordWithPolicy,
  updateWithPolicy,
  deleteWithPolicy,
  createPolicyContext,
} from './apply.ts';
