// Audit log plugin - Worker module version
// This file is loaded directly by a Worker and handles all messages

/// <reference lib="webworker" />

import type {
  ActionContext,
  CrudAction,
  Serializable,
} from '@drizzle-cms/handlers-workers';
import { assertWorkerContext } from '@drizzle-cms/handlers-workers';

// Declare Worker globals for TypeScript
declare const self: DedicatedWorkerGlobalScope;

// ─────────────────────────────────────────────────────────────
// Worker message types
// ─────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: string;
  type: string;
  payload: Serializable;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: Serializable;
  error?: string;
}

// Import shared types
import type { AuditEntry, AuditLogConfig } from './types.ts';
export type { AuditEntry, AuditLogConfig };

// ─────────────────────────────────────────────────────────────
// Plugin state
// ─────────────────────────────────────────────────────────────

let pluginConfig: AuditLogConfig = {};

/**
 * Check if a table should be audited based on config
 */
export function shouldAuditTable(
  table: string,
  config: AuditLogConfig,
): boolean {
  assertWorkerContext();
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
async function logEntry(
  entry: AuditEntry,
  config: AuditLogConfig,
): Promise<void> {
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
 * Handle an audit action
 */
async function handleAuditAction(ctx: ActionContext): Promise<void> {
  if (!shouldAuditTable(ctx.table, pluginConfig)) {
    return;
  }

  // Skip reads/lists if not configured
  if (ctx.action === 'read' && !pluginConfig.logReads) {
    return;
  }
  if (ctx.action === 'list' && !pluginConfig.logLists) {
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

  await logEntry(entry, pluginConfig);
}

// ─────────────────────────────────────────────────────────────
// Worker message handler
// ─────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    let result: Serializable = null;

    switch (type) {
      case 'init': {
        // Store config for later use
        const initPayload = payload as { config?: Serializable };
        pluginConfig = (initPayload.config ?? {}) as AuditLogConfig;
        console.log('[audit] Plugin initialized with config:', pluginConfig);
        result = { success: true };
        break;
      }

      case 'action': {
        const actionPayload = payload as unknown as {
          action: CrudAction;
          ctx: ActionContext;
        };
        await handleAuditAction(actionPayload.ctx);
        result = null;
        break;
      }

      case 'transform:beforeSave':
      case 'transform:afterRead': {
        // Audit log doesn't transform data, just pass through
        const transformPayload = payload as {
          data: Record<string, Serializable>;
        };
        result = transformPayload.data as Serializable;
        break;
      }

      default:
        // Unknown message type - ignore
        result = null;
    }

    const response: WorkerResponse = { id, success: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

// Log that the worker has loaded
console.log('[audit] Worker loaded');
