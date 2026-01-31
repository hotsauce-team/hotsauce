# @hotsauce/plugins

Official plugins for the Drizzle CMS.

## Installation

```bash
# Deno
deno add jsr:@hotsauce/plugins

# Node
npx jsr add @hotsauce/plugins
```

## Available Plugins

### Audit Log

Logs all CRUD operations for compliance and debugging.

```typescript
import type { AuditLogConfig } from '@hotsauce/plugins/audit-log';
import { createCmsHandler } from '@hotsauce/handlers';

// Create Worker for plugin isolation (you control permissions)
const auditWorker = new Worker(
  import.meta.resolve('@hotsauce/plugins/audit-log/worker'),
  {
    type: 'module',
    // Deno-specific: restrict what the plugin can access
    deno: { permissions: { net: ['api.example.com'] } },
  },
);

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    {
      name: 'audit-log',
      worker: auditWorker,
      // Filter: only forward create/update/delete actions to Worker
      filter: (ctx) =>
        ctx.hookType === 'action' &&
        ['create', 'update', 'delete'].includes(ctx.action),
      config: {
        webhookUrl: 'https://api.example.com/audit', // Optional
        includeTables: ['posts', 'users'], // Only log these
        excludeTables: ['sessions'], // Skip these
        logReads: false, // Don't log reads
        logLists: false, // Don't log lists
      } satisfies AuditLogConfig,
    },
  ],
});
```

#### Configuration Options

| Option          | Type       | Description                          |
| --------------- | ---------- | ------------------------------------ |
| `webhookUrl`    | `string`   | URL to POST audit events to          |
| `includeTables` | `string[]` | Only log these tables (empty = all)  |
| `excludeTables` | `string[]` | Skip these tables                    |
| `logReads`      | `boolean`  | Log read operations (default: false) |
| `logLists`      | `boolean`  | Log list operations (default: false) |

#### Audit Entry Format

```typescript
interface AuditEntry {
  timestamp: string; // ISO 8601
  action: 'create' | 'read' | 'update' | 'delete' | 'list';
  table: string;
  recordId?: string | number;
  user?: { sub: string; role?: string };
  oldData?: unknown; // Previous state (update/delete)
  newData?: unknown; // New state (create/update)
}
```

## Creating Custom Plugins

Plugins run in isolated Web Workers. You provide the Worker instance, giving full control over permissions. See the [handlers README](../handlers/README.md#plugins) for detailed documentation.

### Quick Example

```typescript
// Create Worker with your desired permissions
const myPluginWorker = new Worker(
  import.meta.resolve('./my-plugin.worker.ts'),
  { type: 'module' },
);

// Register plugin
plugins: [
  {
    name: 'my-plugin',
    worker: myPluginWorker,
    // Filter: control which hooks are forwarded to Worker
    filter: (ctx) => ctx.hookType === 'action' && ctx.action === 'create',
    config: {/* passed to createPlugin() */},
  },
];

// my-plugin.worker.ts (runs in Worker)
import type { PluginHooks, Serializable } from '@hotsauce/plugins';

export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  return {
    hooks: {
      on: {
        create: async (ctx) => {
          console.log('Created:', ctx.table, ctx.recordId);
        },
      },
    },
  };
}
```

### Filter Function

Use `filter` to control which hooks are forwarded to the Worker (or invoked for in-process plugins):

```typescript
// Only action hooks for create/update/delete
filter: ((ctx) =>
  ctx.hookType === 'action' &&
  ['create', 'update', 'delete'].includes(ctx.action));

// Skip certain tables
filter: ((ctx) => ctx.table !== 'sessions');

// Skip admin users
filter: ((ctx) => ctx.user?.role !== 'admin');
```

FilterContext contains: `{ hookType, table, action, user }`
