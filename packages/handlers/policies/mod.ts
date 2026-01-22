// Policy module entry point
// Re-exports all policy types, helpers, and application functions

// ─────────────────────────────────────────────────────────────
// Types - Policy definitions and results
// ─────────────────────────────────────────────────────────────
export type {
  ActionPolicies,
  Policies,
  Policy,
  PolicyApplicationResult,
  PolicyContext,
  PolicyFn,
  PolicyResult,
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
// Application - Apply policies to queries
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
