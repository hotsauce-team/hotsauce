// Audit log plugin - Worker module version
// This file is imported by the Worker and runs in isolation

import type { ActionContext, PluginHooks, Serializable } from '@drizzle-cms/handlers-workers';

/**
 * Configuration for the audit log plugin
 */
export interface AuditLogConfig {
  /** Webhook URL to POST audit events to */
  webhookUrl?: string;
  /** Tables to include (empty = all) */
  includeTables?: string[];
  /** Tables to exclude */
  excludeTables?: string[];
  /** Whether to log read operations */
  logReads?: boolean;
  /** Whether to log list operations */
  logLists?: boolean;
}

/**
 * Audit log entry structure
 */
export interface AuditEntry {
  timestamp: string;
  action: string;
  table: string;
  recordId?: string | number;
  user?: { sub: string; role?: string };
  oldData?: unknown;
  newData?: unknown;
}

/**
 * Check if a table should be audited based on config
 */
function shouldAuditTable(table: string, config: AuditLogConfig): boolean {
  if (config.excludeTables?.includes(table)) {
    return false;
  }
  if (config.includeTables && config.includeTables.length > 0) {
    return config.includeTables.includes(table);
  }
  return true;
}

/**
 * Log an audit entry
 */
async function logEntry(entry: AuditEntry, config: AuditLogConfig): Promise<void> {
  // Log to console for debugging
  console.log('[audit]', JSON.stringify(entry));

  // If webhook configured, send there
  if (config.webhookUrl) {
    try {
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      // Fire-and-forget - don't fail the request
      console.error('[audit] Webhook failed:', error);
    }
  }
}

/**
 * Create the audit handler for an action
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
 * Factory function called by the Worker with config.
 * This is the preferred pattern for Worker plugins.
 * 
 * @param config - Plugin configuration (passed from CMS options)
 * @returns Plugin definition with hooks
 */
export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  const auditConfig = (config ?? {}) as AuditLogConfig;
  const handler = createAuditHandler(auditConfig);
  
  return {
    hooks: {
      on: {
        create: { handler, fireAndForget: true },
        update: { handler, fireAndForget: true },
        delete: { handler, fireAndForget: true },
        read: auditConfig.logReads ? { handler, fireAndForget: true } : undefined,
        list: auditConfig.logLists ? { handler, fireAndForget: true } : undefined,
      },
    },
  };
}
