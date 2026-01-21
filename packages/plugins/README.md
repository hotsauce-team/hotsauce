# @drizzle-cms/plugins

Official plugin collection for Drizzle CMS.

## Installation

```bash
# Deno
import { createAuditLogPlugin } from '@drizzle-cms/plugins';

# Node.js (via JSR)
npm install @drizzle-cms/plugins
```

## Plugins

### Audit Log Plugin

Tracks all create, update, and delete operations to an audit log table.

```typescript
import { createCmsHandler } from '@drizzle-cms/handlers';
import { createAuditLogPlugin } from '@drizzle-cms/plugins';
import { pgTable, serial, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Define audit log table
const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull(),
  action: text('action').notNull(),
  recordId: text('record_id').notNull(),
  userId: text('user_id'),
  changes: jsonb('changes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Create CMS handler with audit plugin
const handler = createCmsHandler({
  db,
  schema,
  plugins: [
    createAuditLogPlugin({
      db,
      auditTable: auditLogs,
      logFullRecord: true,           // Include complete record data
      excludeTables: ['audit_logs'], // Skip self-auditing
    }),
  ],
});
```

**Options:**

- `db` - Drizzle database instance (same as CMS db)
- `auditTable` - Audit log table (must have specific schema)
- `includeTables` - Optional: Only audit specific tables
- `excludeTables` - Optional: Exclude specific tables from auditing
- `logFullRecord` - Optional: Log full record data (default: false)

**Required Audit Table Schema:**

```typescript
{
  id: serial/autoincrement (primary key)
  tableName: string
  action: string ('create' | 'update' | 'delete')
  recordId: string
  userId: string (nullable)
  changes: json/text (optional, for full record logging)
  createdAt: timestamp
}
```

## Creating Custom Plugins

See the [Plugin API documentation](../handlers/README.md#plugins) in `@drizzle-cms/handlers` for details on creating custom plugins.

## License

MIT
