# @hotsauce/plugins

Official plugins for the HotSauce CMS.

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
import { createCmsHandler } from '@hotsauce/cms';

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

### Puck Visual Editor

Integrates the [Puck](https://github.com/measuredco/puck) visual editor for JSON content columns. The plugin bundles React + Puck and serves them automatically — you only provide your own components.

```typescript
import { createPuckPlugin } from '@hotsauce/plugins/puck';
import { createCmsHandler } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    createPuckPlugin({
      basePath: '/admin',
      componentsJs: '/admin/components.js',
      componentsCss: '/admin/components.css', // Optional
    }),
  ],
});
```

#### Schema Setup

Mark JSON columns with `.$cms({ plugins: { puck: true } })` to enable the editor:

```typescript
import { jsonb, pgTable, serial, text } from 'drizzle-orm/pg-core';

export const pages = pgTable('pages', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: jsonb('content').$cms({ plugins: { puck: true } }),
});
```

Columns marked with Puck will show an "Edit with Puck" link in the CMS that opens the visual editor.

#### Configuration Options

| Option          | Type     | Description                                    |
| --------------- | -------- | ---------------------------------------------- |
| `basePath`      | `string` | Base path of the CMS admin (e.g., `/admin`)    |
| `componentsJs`  | `string` | URL to your components ES module bundle        |
| `componentsCss` | `string` | Optional URL to CSS for your custom components |

#### Components Bundle

Your components bundle must export a `config` object mapping component names to Puck component definitions. Use `globalThis.React` provided by the editor:

```typescript
// components.tsx
const React = globalThis.React;

export const config = {
  components: {
    Heading: {
      fields: {
        text: { type: 'text' },
        level: {
          type: 'select',
          options: [
            { label: 'H1', value: 'h1' },
            { label: 'H2', value: 'h2' },
          ],
        },
      },
      render: ({ text, level: Tag = 'h1' }) => <Tag>{text}</Tag>,
    },
    Paragraph: {
      fields: {
        content: { type: 'textarea' },
      },
      render: ({ content }) => <p>{content}</p>,
    },
  },
};
```

See the [Puck documentation](https://puckeditor.com/docs) for component configuration options.

### S3 Storage

S3-compatible object storage for file uploads. Enables direct browser-to-S3 uploads using presigned URLs, keeping large files off your server.

```typescript
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';
import { createCmsHandler } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    createS3StoragePlugin({
      basePath: '/admin',
      endpoint: 'https://s3.us-east-1.amazonaws.com',
      region: 'us-east-1',
      bucket: 'my-uploads',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }),
  ],
  storage: {
    defaultObjectStorageId: 's3', // Route file fields to S3
  },
});
```

#### Schema Setup

Mark JSON columns with `.$cms({ file: true })` to enable S3 uploads:

```typescript
file: jsonb('file').$cms({ file: true }),
```

#### Configuration Options

| Option            | Type                 | Description                                       |
| ----------------- | -------------------- | ------------------------------------------------- |
| `basePath`        | `string`             | Base path of the CMS admin (e.g., `/admin`)       |
| `endpoint`        | `string`             | S3 endpoint URL                                   |
| `region`          | `string`             | AWS region (e.g., `us-east-1`)                    |
| `bucket`          | `string \| Function` | Bucket name or function for dynamic routing       |
| `accessKeyId`     | `string`             | AWS access key                                    |
| `secretAccessKey` | `string`             | AWS secret key                                    |
| `storageId`       | `string`             | Storage ID (default: `'s3'`)                      |
| `publicEndpoint`  | `string`             | Browser-facing endpoint (for Docker/proxy setups) |
| `urlExpiry`       | `number`             | Presigned URL expiry in seconds (default: 3600)   |

Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, and any S3-compatible service.

See [s3-storage/README.md](./s3-storage/README.md) for detailed documentation.

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

## Future Considerations

### Client-Side Error Tracking (`onClientError`)

Allow integrators to inject client-side JavaScript for error tracking (e.g., Sentry, LogRocket, Datadog RUM). This would require:

1. **Configuration option** — `clientScripts.src` (URLs to load) and `clientScripts.init` (inline JS to run)
2. **CSP modifications** — Integrators would need to allow external script sources and connect-src for the tracking service
3. **Alternative approach** — Document how to wrap the CMS handler and inject scripts via response transformation, keeping the CMS secure by default

Current workaround: Integrators can wrap responses and inject their own `<script>` tags while managing CSP at their server layer.
