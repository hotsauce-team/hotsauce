# @hotsauce/handlers-workers

Worker sandbox execution for CMS plugins. Provides isolated execution environment for untrusted plugin code.

## Overview

This package handles the Worker-based isolation layer for plugins:

- **Worker execution**: Runs plugin hooks in isolated Web Workers
- **Message passing**: Serializable-only communication with plugins
- **User-provided Workers**: You create Workers with desired permissions
- **Cross-runtime**: Compatible with Deno and Node.js 20+

## Installation

```bash
# Deno
deno add jsr:@hotsauce/handlers-workers

# Node
npx jsr add @hotsauce/handlers-workers
```

## Usage

This package is primarily used internally by `@hotsauce/handlers`. For direct usage:

```typescript
import { WorkerExecutor } from '@hotsauce/handlers-workers';
import type { RegisteredPlugin } from '@hotsauce/handlers-workers';

// Create executor
const executor = new WorkerExecutor();

// User creates Worker with explicit permissions
const worker = new Worker(
  import.meta.resolve('./my-plugin.worker.ts'),
  {
    type: 'module',
    deno: { permissions: { net: ['api.example.com'] } }, // Deno-specific
  },
);

// Initialize a plugin
const registered: RegisteredPlugin = {
  plugin: {
    name: 'my-plugin',
    worker: worker,
  },
  initialized: false,
  isWorker: true,
};

await executor.initPlugin(registered);

// Execute hooks
const transformedData = await executor.executeBeforeSave(
  [registered],
  ctx,
  data,
);
await executor.executeAction([registered], 'create', actionCtx);

// Cleanup
executor.terminate();
```

## User-Provided Workers

You provide the Worker instance, giving full control over isolation:

```typescript
// Create Worker with your desired permissions
const myWorker = new Worker(
  import.meta.resolve('@hotsauce/plugins/audit-log/worker'),
  {
    type: 'module',
    // Deno: restrict permissions
    deno: { permissions: { net: ['audit.example.com'] } },
  },
);
```

> **Deno:** When using `deno.permissions` in Worker constructors, you must run with `--unstable-worker-options`:
>
> ```bash
> deno run --unstable-worker-options --permission-set=your-permission-set server.ts
> ```

```typescript
// Use in plugin config
{
  name: 'audit-log',
  worker: myWorker,
  filter: (ctx) => ctx.hookType === 'action',
  config: { webhookUrl: 'https://audit.example.com' },
}
```

Benefits:

- **Security**: You control what each plugin can access
- **Isolation**: Plugin code runs entirely in the Worker
- **Flexibility**: Use Deno permissions, Node policies, etc.

## Writing Plugin Worker Modules

Plugin modules loaded by Workers must export a `createPlugin` factory:

```typescript
// my-plugin.worker.ts
import type { PluginHooks, Serializable } from '@hotsauce/handlers-workers';

export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  return {
    hooks: {
      on: {
        create: async (ctx) => {
          console.log('Record created:', ctx.table, ctx.recordId);
        },
      },
    },
  };
}
```

## Serializable Constraint

All data crossing the Worker boundary must be JSON-serializable:

✅ **Allowed**: strings, numbers, booleans, null, arrays, plain objects, Date\
❌ **Not allowed**: functions, class instances, symbols, circular references
