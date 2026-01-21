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

```typescript
import { createCmsHandler } from '@drizzle-cms/handlers';
import { createWorkerPlugin } from '@drizzle-cms/handlers-workers';
import { createAuditLogPlugin } from '@drizzle-cms/handlers';

// Wrap your plugin with worker isolation
const isolatedAuditPlugin = createWorkerPlugin({
  plugin: createAuditLogPlugin({
    db,
    auditTable: schema.auditLogs,
    logFullRecord: true,
  }),
  // Worker file path
  workerUrl: new URL('./audit-worker.ts', import.meta.url),
  // Optional: Deno-specific permissions
  permissions: {
    read: false,
    write: ['./audit-logs'],
    net: false,
  },
});

const handler = createCmsHandler({
  db,
  schema,
  plugins: [isolatedAuditPlugin],
});
```

### Worker Plugin File

Create a worker file that handles plugin hooks:

```typescript
// audit-worker.ts
import { createAuditLogPlugin } from '@drizzle-cms/handlers';
import { setupWorkerPlugin } from '@drizzle-cms/handlers-workers/worker';

// Initialize plugin in worker context
const auditPlugin = createAuditLogPlugin({
  // Plugin configuration
  // Note: db instance passed via IPC proxy
});

// Set up worker message handling
setupWorkerPlugin(auditPlugin);
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

```typescript
createWorkerPlugin({
  plugin: myPlugin,
  workerUrl,
  permissions: {
    read: ['./data'],           // Limited file read
    write: ['./logs'],          // Limited file write
    net: ['api.example.com'],   // Specific domains only
    env: false,                 // No env access
    run: false,                 // No subprocess spawn
  },
});
```

### Node.js Limitations

Node.js worker_threads don't have built-in permission sandboxing. Use OS-level isolation:

- Docker containers with resource limits
- systemd sandboxing
- Separate user accounts
- SELinux/AppArmor policies

## API Reference

### `createWorkerPlugin(options)`

Wraps a plugin to run in an isolated worker process.

**Options:**
- `plugin: Plugin` - The plugin to isolate
- `workerUrl: URL` - Path to worker entry file
- `permissions?: DenoPermissions` - Deno-only permission object
- `timeout?: number` - Hook execution timeout (default: 30000ms)

**Returns:** `Plugin` - Worker-wrapped plugin

### `setupWorkerPlugin(plugin)`

Called inside worker file to handle IPC messages.

**Parameters:**
- `plugin: Plugin` - Plugin instance to execute

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
