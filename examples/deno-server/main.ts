// deno-lint-ignore-file no-console
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  adminOr,
  createCmsHandler,
  ownedBy,
  PasswordProvider,
  readOnly,
} from '@drizzle-cms/handlers';
// Type-only import - no plugin code runs, just compile-time type checking
import type { AuditLogConfig } from '@drizzle-cms/plugins/audit-log';
import { parsers, posts, schema, users } from './schema.ts';

// Database connection (persisted to ./data)
const client = new PGlite('./data');
const db = drizzle(client, { schema });

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

// Create CMS handler with authentication
// Secrets can be passed directly or via environment variables:
//   CMS_CSRF_SECRET - for CSRF token signing
//   CMS_JWT_SECRET - for JWT signing (when auth enabled)
const cmsHandler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  // JWT authentication - enables /login and /logout routes
  auth: {
    // PasswordProvider defaults: id, email, passwordHash, role columns
    provider: new PasswordProvider({ db, usersTable: users }),
  },
  // Row-level security policies (atomic authorization in WHERE clauses)
  policies: {
    posts: adminOr(ownedBy(posts, 'authorId')), // Admins see all, users see own
    categories: (readOnly()), // Admins: full access, others: read-only
  },
  // Plugins for extending CMS functionality
  // Pass a pre-created Worker for full control over isolation and permissions
  plugins: [
    // Worker-isolated plugin (recommended for third-party)
    {
      name: 'audit-log',
      worker: auditLogWorker,
      // Filter which hooks are forwarded to the Worker
      // Return true to invoke, false to skip (avoids Worker message overhead)
      filter: (ctx) =>
        ctx.hookType === 'action' &&
        ['create', 'update', 'delete'].includes(ctx.action),
      config: auditLogConfig,
    },
    // In-process plugin example (for trusted first-party code)
    {
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
    },
  ],
  // User input parsers for validation (validation library agnostic)
  parsers,
  // Log errors to console (in production, use a proper logging service)
  onError: (error, context) => console.error('CMS Error:', { error, context }),
});

// Simple HTTP server
const PORT = 3000;

console.log(`🚀 CMS running at http://localhost:${PORT}/admin`);
console.log(`   Login with the admin account created by seed.ts`);

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, async (request: Request) => {
  const url = new URL(request.url);

  // Redirect root to admin
  if (url.pathname === '/') {
    return Response.redirect(new URL('/admin', request.url), 302);
  }

  // Handle admin routes (auth is built-in)
  if (url.pathname.startsWith('/admin')) {
    return await cmsHandler(request);
  }

  // 404 for everything else
  return new Response('Not Found', { status: 404 });
});
