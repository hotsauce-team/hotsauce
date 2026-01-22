// Audit log plugin - main entry point
// For type checking and registration

import type {
  ActionContext,
  CrudAction,
  PluginHooks,
} from '@drizzle-cms/handlers-workers';

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

// In-memory log storage (for testing/demo purposes)
const auditLog: AuditEntry[] = [];

/**
 * Get the audit log entries (for testing)
 */
export function getAuditLog(): AuditEntry[] {
  return [...auditLog];
}

/**
 * Clear the audit log (for testing)
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

/**
 * Check if a table should be audited based on config
 */
function shouldAuditTable(table: string, config: AuditLogConfig): boolean {
  // Check exclusions first
  if (config.excludeTables?.includes(table)) {
    return false;
  }

  // If includes specified, check membership
  if (config.includeTables && config.includeTables.length > 0) {
    return config.includeTables.includes(table);
  }

  return true;
}

/**
 * Log an audit entry
 */
async function logEntry(
  entry: AuditEntry,
  config: AuditLogConfig,
): Promise<void> {
  // Always store in memory for testing
  auditLog.push(entry);

  // If webhook configured, send there too
  if (config.webhookUrl) {
    try {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      // Fire-and-forget - don't fail the request
      console.error('Audit webhook failed:', error);
    }
  }
}

/**
 * Create audit handler for an action
 */
function createAuditHandler(config: AuditLogConfig) {
  return async (ctx: ActionContext): Promise<void> => {
    if (!shouldAuditTable(ctx.table, config)) {
      return;
    }

    // Skip reads/lists if not configured
    if (ctx.action === 'read' && !config.logReads) {
      return;
    }
    if (ctx.action === 'list' && !config.logLists) {
      return;
    }

    const entry: AuditEntry = {
      timestamp: ctx.timestamp,
      action: ctx.action,
      table: ctx.table,
      recordId: ctx.recordId,
      user: ctx.user,
      oldData: ctx.oldData,
      newData: ctx.newData,
    };

    await logEntry(entry, config);
  };
}

/**
 * Plugin definition returned by createAuditLogPlugin
 */
export interface AuditLogPlugin {
  name: string;
  description: string;
  moduleUrl: string;
  hooks: PluginHooks;
  capabilities: {
    actions: CrudAction[];
    network?: string[];
  };
}

/**
 * Create the audit log plugin
 *
 * @example
 * ```ts
 * import { createAuditLogPlugin } from '@drizzle-cms/plugins/audit-log';
 *
 * const handler = createCmsHandler({
 *   // ... other options
 *   plugins: [
 *     {
 *       plugin: createAuditLogPlugin({
 *         excludeTables: ['_sessions'],
 *         logReads: false,
 *       }),
 *     },
 *   ],
 * });
 * ```
 */
export function createAuditLogPlugin(
  config: AuditLogConfig = {},
): AuditLogPlugin {
  const handler = createAuditHandler(config);

  return {
    name: 'audit-log',
    description: 'Logs all CRUD operations for auditing purposes',

    // Worker module URL - the Worker will import this and run hooks in isolation
    // This ensures the plugin code runs sandboxed from the main thread
    moduleUrl: new URL('./worker.ts', import.meta.url).href,

    // Hooks are also defined here for:
    // 1. Type checking and validation at registration time
    // 2. In-process fallback if Worker isolation is disabled
    hooks: {
      // Action hooks - fire and forget so they don't slow down requests
      on: {
        create: { handler, fireAndForget: true },
        read: config.logReads ? { handler, fireAndForget: true } : undefined,
        update: { handler, fireAndForget: true },
        delete: { handler, fireAndForget: true },
        list: config.logLists ? { handler, fireAndForget: true } : undefined,
      },
    },

    capabilities: {
      actions: [
        'create',
        'update',
        'delete',
        ...(config.logReads ? ['read'] : []),
        ...(config.logLists ? ['list'] : []),
      ] as CrudAction[],
      network: config.webhookUrl
        ? [new URL(config.webhookUrl).host]
        : undefined,
    },
  };
}
