# @drizzle-cms/plugins

Official plugins for the Drizzle CMS.

## Installation

```bash
# Deno
deno add jsr:@drizzle-cms/plugins

# Node
npx jsr add @drizzle-cms/plugins
```

## Available Plugins

### Audit Log

Logs all CRUD operations for compliance and debugging.

```typescript
import { createAuditLogPlugin } from '@drizzle-cms/plugins/audit-log';
import { createCmsHandler } from '@drizzle-cms/handlers';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    {
      plugin: createAuditLogPlugin({
        webhookUrl: 'https://api.example.com/audit', // Optional
        includeTables: ['posts', 'users'],           // Only log these
        excludeTables: ['sessions'],                 // Skip these
        logReads: false,                             // Don't log reads
        logLists: false,                             // Don't log lists
      }),
    },
  ],
});
```

#### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `webhookUrl` | `string` | URL to POST audit events to |
| `includeTables` | `string[]` | Only log these tables (empty = all) |
| `excludeTables` | `string[]` | Skip these tables |
| `logReads` | `boolean` | Log read operations (default: false) |
| `logLists` | `boolean` | Log list operations (default: false) |

#### Audit Entry Format

```typescript
interface AuditEntry {
  timestamp: string;           // ISO 8601
  action: 'create' | 'read' | 'update' | 'delete' | 'list';
  table: string;
  recordId?: string | number;
  user?: { sub: string; role?: string };
  oldData?: unknown;           // Previous state (update/delete)
  newData?: unknown;           // New state (create/update)
}
```

## Creating Custom Plugins

Plugins run in isolated Web Workers. See the [handlers README](../handlers/README.md#plugins) for detailed documentation on creating plugins.

### Quick Example

```typescript
// my-plugin.ts (main entry)
import type { PluginHooks } from '@drizzle-cms/plugins';

export function createMyPlugin(config: MyConfig) {
  return {
    name: 'my-plugin',
    moduleUrl: new URL('./my-plugin.worker.ts', import.meta.url).href,
    hooks: { /* for type checking */ },
    capabilities: { actions: ['create'] },
  };
}

// my-plugin.worker.ts (runs in Worker)
import type { Serializable, PluginHooks } from '@drizzle-cms/plugins';

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
