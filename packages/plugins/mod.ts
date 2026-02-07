/**
 * @module
 *
 * Official plugins for the HotSauce CMS.
 *
 * This package provides ready-to-use plugins that extend CMS functionality.
 * Plugins run in isolated Web Workers for security and use declarative hooks.
 *
 * @example
 * ```ts
 * import type { AuditLogConfig } from "@hotsauce/plugins";
 *
 * const auditConfig: AuditLogConfig = {
 *   webhookUrl: "https://audit.example.com/events",
 * };
 * ```
 */

/**
 * Audit log entry structure representing a single audited action.
 * @see {@link AuditLogConfig} for configuration options
 */
export type { AuditEntry } from './audit-log/types.ts';

/**
 * Configuration options for the audit log plugin.
 * @see {@link AuditEntry} for the logged entry structure
 */
export type { AuditLogConfig } from './audit-log/types.ts';
