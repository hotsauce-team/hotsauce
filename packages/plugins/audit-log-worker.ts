// Worker entrypoint for audit-log plugin with process isolation
// This file runs in a separate process with no database access
// It just logs audit events to the console

import { setupWorkerPlugin } from '@drizzle-cms/handlers-workers/worker';
import type { AfterContext } from '@drizzle-cms/handlers';

// Define a simplified audit log plugin that just console.logs
function createConsoleAuditLogPlugin(config?: { logFullRecord?: boolean; excludeTables?: string[] }) {
  const { logFullRecord = false, excludeTables = [] } = config || {};
  
  // Helper to check if table should be audited
  const shouldAudit = (tableName: string): boolean => {
    if (excludeTables.includes(tableName)) {
      return false;
    }
    return true;
  };
  
  // Helper to get primary key value
  const getPrimaryKeyValue = (table: AfterContext['table'], record: Record<string, unknown>): string => {
    const pkColumn = table.columns.find((col) => col.isPrimaryKey);
    if (!pkColumn) {
      return 'unknown';
    }
    const pkValue = record[pkColumn.name];
    return pkValue ? String(pkValue) : 'unknown';
  };
  
  return {
    name: 'audit-log-worker',
    hooks: {
      afterCreate: async (ctx: AfterContext) => {
        if (!shouldAudit(ctx.table.name)) return;
        
        const recordId = getPrimaryKeyValue(ctx.table, ctx.record);
        console.log('[AUDIT] CREATE:', {
          table: ctx.table.name,
          recordId,
          userId: ctx.authUser?.id,
          ...(logFullRecord ? { record: ctx.record } : {}),
        });
      },
      
      afterUpdate: async (ctx: AfterContext) => {
        if (!shouldAudit(ctx.table.name)) return;
        
        const recordId = ctx.recordId ?? getPrimaryKeyValue(ctx.table, ctx.record);
        console.log('[AUDIT] UPDATE:', {
          table: ctx.table.name,
          recordId,
          userId: ctx.authUser?.id,
          ...(logFullRecord ? { record: ctx.record } : {}),
        });
      },
      
      afterDelete: async (ctx: AfterContext) => {
        if (!shouldAudit(ctx.table.name)) return;
        
        const recordId = ctx.recordId ?? getPrimaryKeyValue(ctx.table, ctx.record);
        console.log('[AUDIT] DELETE:', {
          table: ctx.table.name,
          recordId,
          userId: ctx.authUser?.id,
        });
      },
    },
  };
}

// Set up the worker plugin - receives config via IPC
setupWorkerPlugin((config) => {
  return createConsoleAuditLogPlugin(config);
});
