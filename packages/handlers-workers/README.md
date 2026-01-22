# @drizzle-cms/handlers-workers

Worker sandbox execution for CMS plugins. Provides isolated execution environment for untrusted plugin code.

## Overview

This package handles the Worker-based isolation layer for plugins:

- **Worker execution**: Runs plugin hooks in isolated Web Workers
- **Message passing**: Serializable-only communication with plugins
- **Sandbox modes**: Standard Workers or Deno-sandboxed Workers
- **Cross-runtime**: Compatible with Deno and Node.js 20+

## Installation

```bash
# Deno
deno add jsr:@drizzle-cms/handlers-workers

# Node
npx jsr add @drizzle-cms/handlers-workers
```

## Usage

This package is primarily used internally by `@drizzle-cms/handlers`. For direct usage:

```typescript
import { WorkerExecutor, createWorkerExecutor } from '@drizzle-cms/handlers-workers';
import type { RegisteredPlugin } from '@drizzle-cms/handlers-workers';

// Create executor with sandbox mode
const executor = createWorkerExecutor('worker'); // or 'deno-sandbox'

// Initialize a plugin
const registered: RegisteredPlugin = {
  plugin: {
    name: 'my-plugin',
    moduleUrl: new URL('./my-plugin.worker.ts', import.meta.url).href,
    hooks: { /* ... */ },
  },
  config: { /* serializable config */ },
  initialized: false,
};

await executor.initPlugin(registered);

// Execute hooks
const transformedData = await executor.executeBeforeSave([registered], ctx, data);
await executor.executeAction([registered], 'create', actionCtx);

// Cleanup
executor.terminate();
```

## Sandbox Modes

| Mode | Runtime | Features |
|------|---------|----------|
| `'worker'` | All | Standard Web Worker isolation |
| `'deno-sandbox'` | Deno only | Restricted permissions (no fs, no env, limited network) |

## Writing Plugin Worker Modules

Plugin modules loaded by Workers must export a `createPlugin` factory:

```typescript
// my-plugin.worker.ts
import type { Serializable, PluginHooks } from '@drizzle-cms/handlers-workers';

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

✅ **Allowed**: strings, numbers, booleans, null, arrays, plain objects, Date  
❌ **Not allowed**: functions, class instances, symbols, circular references
