// Audit log plugin for tracking database changes

import type { Plugin, AfterContext, BeforeContext } from './types.ts';
import type { Table } from 'drizzle-orm';

/**
 * Options for creating an audit log plugin
 */
export interface AuditLogPluginOptions {
  /**
   * Drizzle database instance (should be same as CMS db)
   */
  // deno-lint-ignore no-explicit-any
  db: any;
  
  /**
   * Audit log table (must have specific columns)
   * 
   * Expected schema:
   * - id: primary key (serial/autoincrement)
   * - tableName: string
   * - action: string ('create' | 'update' | 'delete')
   * - recordId: string
   * - userId: string (nullable)
   * - changes: json/text (optional)
   * - createdAt: timestamp
   */
  // deno-lint-ignore no-explicit-any
  auditTable: Table | any;
  
  /**
   * Optional: Filter which tables to audit
   * If not provided, all tables are audited
   */
  includeTables?: string[];
  
  /**
   * Optional: Exclude specific tables from auditing
   */
  excludeTables?: string[];
  
  /**
   * Optional: Whether to log full record data
   * Default: false (only logs action metadata)
   */
  logFullRecord?: boolean;
}

/**
 * Create an audit log plugin
 * 
 * Logs all create, update, and delete operations to an audit log table.
 * 
 * @example
 * ```ts
 * import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
 * 
 * const auditLogs = pgTable('audit_logs', {
 *   id: serial('id').primaryKey(),
 *   tableName: text('table_name').notNull(),
 *   action: text('action').notNull(),
 *   recordId: text('record_id').notNull(),
 *   userId: text('user_id'),
 *   changes: jsonb('changes'),
 *   createdAt: timestamp('created_at').defaultNow().notNull(),
 * });
 * 
 * const handler = createCmsHandler({
 *   db,
 *   schema,
 *   plugins: [
 *     createAuditLogPlugin({
 *       db,
 *       auditTable: auditLogs,
 *       logFullRecord: true,
 *     }),
 *   ],
 * });
 * ```
 */
export function createAuditLogPlugin(options: AuditLogPluginOptions): Plugin {
  const { db, auditTable, includeTables, excludeTables, logFullRecord = false } = options;
  
  // Helper to check if table should be audited
  const shouldAudit = (tableName: string): boolean => {
    if (excludeTables?.includes(tableName)) {
      return false;
    }
    if (includeTables && !includeTables.includes(tableName)) {
      return false;
    }
    return true;
  };
  
  // Helper to create audit log entry
  const logAudit = async (
    tableName: string,
    action: 'create' | 'update' | 'delete',
    recordId: string,
    userId: string | undefined,
    changes?: Record<string, unknown>
  ): Promise<void> => {
    if (!shouldAudit(tableName)) {
      return;
    }
    
    try {
      await db.insert(auditTable).values({
        tableName,
        action,
        recordId: String(recordId),
        userId: userId ?? null,
        changes: logFullRecord ? changes : null,
        createdAt: new Date(),
      });
    } catch (error) {
      // Log error but don't fail the operation
      console.error('Failed to create audit log entry:', error);
    }
  };
  
  return {
    name: 'audit-log',
    hooks: {
      afterCreate: async (ctx: AfterContext) => {
        const recordId = getPrimaryKeyValue(ctx.table, ctx.record);
        await logAudit(
          ctx.table.name,
          'create',
          recordId,
          ctx.authUser?.id,
          logFullRecord ? ctx.record : undefined
        );
      },
      
      afterUpdate: async (ctx: AfterContext) => {
        const recordId = ctx.recordId ?? getPrimaryKeyValue(ctx.table, ctx.record);
        await logAudit(
          ctx.table.name,
          'update',
          recordId,
          ctx.authUser?.id,
          logFullRecord ? ctx.record : undefined
        );
      },
      
      afterDelete: async (ctx: AfterContext) => {
        const recordId = ctx.recordId ?? getPrimaryKeyValue(ctx.table, ctx.record);
        await logAudit(
          ctx.table.name,
          'delete',
          recordId,
          ctx.authUser?.id,
          logFullRecord ? ctx.record : undefined
        );
      },
    },
  };
}

/**
 * Helper to get primary key value from a record
 */
function getPrimaryKeyValue(table: any, record: Record<string, unknown>): string {
  // Find the primary key column
  const pkColumn = table.columns.find((col: any) => col.primary);
  if (!pkColumn) {
    throw new Error(`No primary key found for table ${table.name}`);
  }
  
  const pkValue = record[pkColumn.propertyName];
  if (pkValue === undefined || pkValue === null) {
    throw new Error(`Primary key value not found in record`);
  }
  
  return String(pkValue);
}
