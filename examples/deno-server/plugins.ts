// Type-only import - no plugin code runs, just compile-time type checking
import type { AuditLogConfig } from '@drizzle-cms/plugins/audit-log';
import type { PluginConfig } from '@drizzle-cms/handlers';

// Create Worker for the audit log plugin
// The plugin code is loaded ONLY in the Worker - no plugin code runs in main thread
// You control permissions - the plugin code runs entirely in this Worker
// Worker console.log outputs appear in the terminal prefixed with [audit]
const auditLogWorker = new Worker(
  import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
  {
    type: 'module',
    // Deno-specific: restrict what the plugin can access
    deno: { permissions: {} },
  },
);

// Audit log plugin configuration
const auditLogConfig: AuditLogConfig = {
  logReads: false, // Skip read operations (can be noisy)
  logLists: false, // Skip list operations
  // webhookUrl: 'https://audit.example.com/events', // Optional: send to external service
};

/**
 * Pre-configured isolated audit log plugin
 * 
 * This plugin runs in a Worker, isolating it from the main CMS process.
 * It logs create, update, and delete actions to the console
 * and can optionally send audit entries to a webhook.
 */
export const isolatedAuditLogPlugin: PluginConfig = {
  name: 'audit-log',
  worker: auditLogWorker,
  // Filter which hooks are forwarded to the Worker
  // Return true to invoke, false to skip (avoids Worker message overhead)
  filter: (ctx) =>
    ctx.hookType === 'action' &&
    ['create', 'update', 'delete'].includes(ctx.action),
  // Plugin configuration object passed to the Worker
  config: auditLogConfig,
};

/**
 * In-process plugin that formats user names before saving.
 * 
 * This plugin runs directly in the main CMS process.
 * It capitalizes the first letter of each part of the user's name
 * when a user record is created or updated.
 */
export const inProcessFormatNamesPlugin: PluginConfig = {
  name: 'format-names',
  hooks: {
    transform: {
      beforeSave: (ctx, data) => {
        if (ctx.table === 'users' && typeof data['name'] === 'string') {
          data['name'] = data['name']
            .split(' ')
            .map((part) =>
              part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )
            .join(' ');
        }
        return data;
      },
    },
  },
  // Filter can also be used for in-process plugins
  filter: (ctx) => ctx.table !== 'sessions',
};
