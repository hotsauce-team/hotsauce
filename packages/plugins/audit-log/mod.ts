/**
 * @module
 *
 * Audit log plugin type exports.
 *
 * This module re-exports types for consumers who want to configure
 * the audit log plugin without importing the worker module directly.
 *
 * @example
 * ```ts
 * import type { AuditLogConfig } from "@hotsauce/plugins/audit-log";
 *
 * const config: AuditLogConfig = {
 *   webhookUrl: "https://audit.example.com/events",
 *   include: ["users", "posts"],
 * };
 * ```
 */

/**
 * Audit log entry structure representing a single audited action.
 * Contains timestamp, action, table, user info, and data snapshots.
 */
export type { AuditEntry } from './types.ts';

/**
 * Configuration options for the audit log plugin.
 * Controls webhook URL, table filtering, and which actions to log.
 */
export type { AuditLogConfig } from './types.ts';
