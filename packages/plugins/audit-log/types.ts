// Audit log plugin - type definitions
// Worker implementation is in worker.ts

/**
 * Configuration for the audit log plugin
 */
export interface AuditLogConfig {
  /** Webhook URL to POST audit events to (optional) */
  webhookUrl?: string;
  /** Tables to include (empty = all) */
  includeTables?: string[];
  /** Tables to exclude */
  excludeTables?: string[];
  /** Whether to log read operations (can be noisy) */
  logReads?: boolean;
  /** Whether to log list operations */
  logLists?: boolean;
}

/**
 * Audit log entry structure
 */
export interface AuditEntry {
  /** Timestamp of the action */
  timestamp: string;
  /** Action performed */
  action: string;
  /** Table affected */
  table: string;
  /** Record ID if applicable */
  recordId?: string | number;
  /** User who performed the action */
  user?: {
    sub: string;
    role?: string;
  };
  /** Previous state for updates/deletes */
  oldData?: unknown;
  /** New state for creates/updates */
  newData?: unknown;
}
