# @hotsauce/workers

Plugin execution infrastructure for HotSauce CMS. Despite the name, this package handles **all plugin execution**—both isolated Worker plugins and in-process plugins.

## Overview

- **Plugin executor**: Runs hooks for both Worker and in-process plugins
- **Worker isolation**: Optional sandboxing via Web Workers for untrusted code
- **Type definitions**: Plugin hooks, contexts, and route types
- **Validation utilities**: Serialization checks for Worker-boundary data
- **Guard utilities**: Let plugin authors verify their execution context
- **Cross-runtime**: Compatible with Deno and Node.js 20+

## Installation

```bash
# Deno
deno add jsr:@hotsauce/workers

# Node
npx jsr add @hotsauce/workers
```

## Usage

This package is primarily used internally by `@hotsauce/cms`. For direct usage:

```typescript
import { WorkerExecutor } from '@hotsauce/workers';
import type { RegisteredPlugin } from '@hotsauce/workers';

// Create executor
const executor = new WorkerExecutor();

// Register an in-process plugin
const inProcessPlugin: RegisteredPlugin = {
  plugin: {
    name: 'my-plugin',
    hooks: {
      on: {
        create: async (ctx) => console.log('Created:', ctx.recordId),
      },
    },
  },
  initialized: true,
  isWorker: false,
};

// Register a Worker plugin
const worker = new Worker(import.meta.resolve('./audit.worker.ts'), {
  type: 'module',
  deno: { permissions: { net: ['audit.example.com'] } },
});

const workerPlugin: RegisteredPlugin = {
  plugin: {
    name: 'audit',
    worker: worker,
    hooks: { on: ['create', 'update', 'delete'] }, // Declarative for Workers
  },
  initialized: false,
  isWorker: true,
};

await executor.initPlugin(workerPlugin);

// Execute hooks (handles both plugin types transparently)
await executor.executeAction([inProcessPlugin, workerPlugin], 'create', ctx);

// Cleanup
executor.terminate();
```

## Plugin Types

### In-Process Plugins

Plugins without a `worker` property run in the main thread with function hooks:

```typescript
const plugin = {
  name: 'format-names',
  hooks: {
    transform: {
      beforeSave: async (ctx, data) => ({
        ...data,
        name: data.name?.toUpperCase(),
      }),
    },
  },
};
```

### Worker Plugins

Plugins with a `worker` property run isolated with declarative hooks:

```typescript
const worker = new Worker(import.meta.resolve('./my-plugin.worker.ts'), {
  type: 'module',
  deno: { permissions: { net: ['api.example.com'] } },
});

const plugin = {
  name: 'audit-log',
  worker: worker,
  hooks: { on: ['create', 'update', 'delete'] }, // Array, not functions
  config: { webhookUrl: 'https://audit.example.com' },
};
```

Worker modules must export a `createPlugin` factory:

```typescript
// my-plugin.worker.ts
import type { PluginHooks, Serializable } from '@hotsauce/workers';

export function createPlugin(config: Serializable): { hooks: PluginHooks } {
  return {
    hooks: {
      on: {
        create: async (ctx) => {
          await fetch(config.webhookUrl, {
            method: 'POST',
            body: JSON.stringify(ctx),
          });
        },
      },
    },
  };
}
```

## Validation Utilities

Check if data is serializable (safe for Worker boundary):

```typescript
import {
  isSerializable,
  SerializationError,
  validateSerializable,
} from '@hotsauce/workers';

// Boolean check
if (isSerializable(data)) {
  // Safe to send to Worker
}

// Throws with path to problem
try {
  validateSerializable(data);
} catch (e) {
  if (e instanceof SerializationError) {
    console.error('Invalid at:', e.path); // e.g., "data.user.save"
  }
}
```

**Serializable types**: strings, numbers, booleans, null, arrays, plain objects, Date\
**Not serializable**: functions, class instances, symbols, circular references

## Guard Utilities

For plugin authors to verify execution context:

```typescript
import { assertWorkerContext, isWorkerContext } from '@hotsauce/workers';

// Check if running in a Worker
if (isWorkerContext()) {
  // Safe to use Worker-only APIs
}

// Throw if not in Worker (for security-critical plugins)
assertWorkerContext(); // Throws if running in main thread
```

## UI Hooks

Plugins can customize field rendering via `renderField`. This returns a `FieldUIOverride`:

```typescript
type FieldUIOverride =
  | null // Use default rendering
  | {
    link?: { label: string; href: string; target?: '_blank' };
    valueSummary?: string; // Plain text, no HTML
  };
```

Example:

```typescript
hooks: {
  ui: {
    renderField: (ctx) => {
      if (ctx.field.plugin?.puck && ctx.recordId) {
        const data = ctx.value as { content?: unknown[] };
        const count = data?.content?.length ?? 0;

        return {
          link: {
            href: `/admin/puck/${ctx.table}/${ctx.recordId}/${ctx.field.name}`,
            label: 'Edit with Puck',
            target: '_blank',
          },
          valueSummary: count === 1 ? '1 block' : `${count} blocks`,
        };
      }
      return null;
    },
  },
}
```

> **Note**: UI hooks can run in Workers or in-process. Worker plugins use the `'ui:renderField'` message type. The return type (`FieldUIOverride`) is fully serializable.

## Exported Types

Key types for plugin authors:

```typescript
import type {
  ActionContext,
  ActionHooks,
  CrudAction,
  FieldUIOverride,
  // Context types
  PluginContext,
  PluginErrorContext,
  // Hook types
  PluginHooks,
  // Route types
  PluginRoute,
  PluginRouteContext,
  PluginRouteHandler,
  // Data types
  Serializable,
  TransformHooks,
  UIHooks,
  UIRenderFieldContext,
} from '@hotsauce/workers';
```

### `PluginErrorContext`

Passed to `onError` when a plugin fails. Part of the `ErrorContext` discriminated union in `@hotsauce/cms`:

```typescript
interface PluginErrorContext {
  /** Always 'plugin' — discriminator for ErrorContext union */
  source: 'plugin';
  /** Plugin name that failed */
  plugin: string;
  /** Type of operation that failed */
  operation:
    | 'init'
    | 'transform:beforeSave'
    | 'transform:afterRead'
    | 'ui:renderField'
    | 'action'
    | 'route:render';
  /** CRUD action (for action hooks) */
  action?: CrudAction;
  /** Hook context active when the error occurred */
  hookContext?: Serializable;
}
```

## Why "workers"?

The package is named for its primary differentiator—Worker-based isolation—but it handles all plugin execution. Think of it as the plugin runtime that _can_ use Workers when you need isolation.
