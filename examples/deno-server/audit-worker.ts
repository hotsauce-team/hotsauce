// Worker file for audit log plugin with process isolation
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createAuditLogPlugin } from '../../packages/plugins/mod.ts';
import { setupWorkerPlugin } from '../../packages/handlers-workers/worker.ts';
import { schema, auditLogs } from './schema.ts';

// Set up database connection in worker (same database, separate process)
const client = new PGlite('./data');
const db = drizzle(client, { schema });

// Set up plugin factory - receives config from each message
setupWorkerPlugin((config) => {
  return createAuditLogPlugin({
    db,
    auditTable: auditLogs,
    logFullRecord: config?.logFullRecord || false,
    excludeTables: config?.excludeTables || [],
  });
});
