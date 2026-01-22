# @drizzle-cms/handlers-workers

Worker-based process isolation for Drizzle CMS plugins.

## Runtime Compatibility

**✅ Deno** - Uses Deno Workers with permission sandboxing  
**✅ Node.js 20+** - Uses `worker_threads` module  
**❌ Bun** - Not yet supported (coming soon)  
**❌ Cloudflare Workers** - Not applicable (no worker isolation in edge runtime)

> **Note:** This package uses runtime-specific APIs. The core `@drizzle-cms/handlers` package remains runtime-agnostic.

## Installation

```bash
# Deno (via JSR)
deno add @drizzle-cms/handlers-workers

# Node.js (via npm - when published)
npm install @drizzle-cms/handlers-workers
```

## Usage

### Basic Worker Isolation

The user creates the Worker instance with appropriate permissions, then passes it to `createWorkerPlugin`:

```typescript
import { createCmsHandler } from '@drizzle-cms/handlers';
import { createWorkerPlugin } from '@drizzle-cms/handlers-workers';

// Create worker with Deno permissions
const auditWorker = new Worker(
  new URL('./audit-worker.ts', import.meta.url),
  { 
    type: 'module',
    deno: { 
      permissions: { 
        write: ['./audit-logs'],
        read: false,
        net: false 
      } 
    }
  }
);

// Create plugin with config and filter
const plugin = createWorkerPlugin(auditWorker, {
  // Plugin configuration passed to worker
  config: { 
    auditTable: 'audit_logs',
    logFullRecord: true 
  },
  // Optional: Filter which hooks to execute
  filter: (ctx) => {
    // Only audit these hooks
    const allowedHooks = ['afterCreate', 'afterUpdate', 'afterDelete'];
    if (!allowedHooks.includes(ctx.hook)) return false;
    
    // Skip admin tables
    return ctx.table !== 'admin_logs';
  },
});

const handler = createCmsHandler({
  db,
  schema,
  plugins: [plugin],
});
```

### Worker Plugin File

Create a worker file that receives config from each message:

```typescript
// audit-worker.ts
import { createAuditLogPlugin } from '@drizzle-cms/plugins';
import { setupWorkerPlugin } from '@drizzle-cms/handlers-workers/worker';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Set up database connection in worker
const sql = postgres(Deno.env.get('DATABASE_URL')!);
const db = drizzle(sql);

// Set up plugin factory - receives config from each message
setupWorkerPlugin((config) => {
  return createAuditLogPlugin({
    db,
    auditTable: config?.auditTable,
    logFullRecord: config?.logFullRecord || false,
  });
});
```

## How It Works

### Fire-and-Forget (After Hooks)

After-hooks (`afterCreate`, `afterUpdate`, etc.) run asynchronously without blocking the main request:

```
User Request → CRUD → Send Event → Continue
                          ↓ (async)
                     Worker Process
```

### Synchronous (Before Hooks)

Before-hooks (`beforeCreate`, `beforeUpdate`, etc.) block and can validate/abort:

```
User Request → CRUD → Wait for Worker → Continue/Abort
                           ↓ (sync)
                      Validation Result
```

## Security Features

### Deno Permissions

Set permissions when creating the Worker instance:

```typescript
const worker = new Worker(
  new URL('./plugin-worker.ts', import.meta.url),
  { 
    type: 'module',
    deno: { 
      permissions: {
        read: ['./data'],           // Limited file read
        write: ['./logs'],          // Limited file write
        net: ['api.example.com'],   // Specific domains only
        env: false,                 // No env access
        run: false,                 // No subprocess spawn
      } 
    }
  }
);
```

### Hook Filtering

The `filter` function provides fine-grained control:

```typescript
createWorkerPlugin(worker, {
  config: { /* ... */ },
  filter: (ctx) => {
    // Hook allowlist
    if (!['afterCreate', 'afterUpdate'].includes(ctx.hook)) {
      return false;
    }
    
    // Table filtering
    if (ctx.table === 'internal_logs') {
      return false;
    }
    
    // User-based filtering
    if (ctx.authUser?.role === 'admin') {
      return false; // Don't audit admins
    }
    
    return true;
  }
});
```

### Node.js Limitations

Node.js worker_threads don't have built-in permission sandboxing. Use OS-level isolation:

- Docker containers with resource limits
- systemd sandboxing
- Separate user accounts
- SELinux/AppArmor policies

## API Reference

### `createWorkerPlugin<TConfig>(worker, options?)`

Creates a worker-isolated plugin wrapper.

**Parameters:**
- `worker: Worker` - Worker instance created by the user
- `options?: WorkerPluginOptions<TConfig>` - Optional configuration
  - `config?: TConfig` - Plugin configuration passed to worker
  - `filter?: (ctx: FilterContext) => boolean` - Hook filter function
  - `timeout?: number` - Hook execution timeout (default: 30000ms)

**Returns:** `Plugin` - Worker-wrapped plugin

**Example:**
```typescript
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
  deno: { permissions: { write: ['./logs'] } }
});

const plugin = createWorkerPlugin(worker, {
  config: { logLevel: 'info' },
  filter: (ctx) => ctx.hook.startsWith('after')
});
```

### `setupWorkerPlugin<TConfig>(pluginFactory)`

Called inside worker file to handle IPC messages.

**Parameters:**
- `pluginFactory: (config?: TConfig) => Plugin` - Factory that creates plugin with config

**Example:**
```typescript
setupWorkerPlugin((config) => {
  return createMyPlugin({
    ...config,
    db: createDbConnection()
  });
});
```

### `FilterContext`

Context object passed to filter function:

```typescript
interface FilterContext {
  hook: keyof PluginHooks;     // Hook name being executed
  table: string;               // Table name
  action: 'create' | 'update' | 'delete' | 'read' | 'list';
  authUser?: { id: string };   // Authenticated user
  request: Request;            // HTTP request
  db: unknown;                 // Database instance
  data?: Record<string, unknown>;      // For before hooks
  record?: Record<string, unknown>;    // For after hooks
  recordId?: string;           // For read/delete hooks
  records?: Record<string, unknown>[]; // For list hooks
}
```

## Performance

**Latency:**
- In-process: ~0.1ms
- Worker (same machine): ~1-5ms
- Webhook (network): ~10-500ms

**Throughput:**
- Workers handle high volume efficiently
- No network overhead
- Shared machine resources

## Examples

See `examples/deno-server` for complete working examples.

## License

MIT
