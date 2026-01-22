// deno-lint-ignore-file no-console
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import {
  adminOr,
  createCmsHandler,
  ownedBy,
  PasswordProvider,
  readOnly,
  type SandboxMode,
} from '@drizzle-cms/handlers';
// Type-only import - no plugin code runs, just compile-time type checking
import type { AuditLogConfig } from '@drizzle-cms/plugins/audit-log';
import { schema, posts, users, parsers } from './schema.ts';

// Database connection (persisted to ./data)
const client = new PGlite('./data');
const db = drizzle(client, { schema });

// Plugin sandbox mode:
// - 'worker': Standard Worker isolation (works on all runtimes)
// - 'deno-sandbox': Deno Worker with restricted permissions (Deno only)
// - 'off': No isolation (for debugging - NOT recommended in production)
const pluginSandbox: SandboxMode = 'worker';

// Audit log plugin configuration (type-only import for DX, no runtime code)
// The plugin code is loaded ONLY in the Worker - no plugin code runs in main thread
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
  // Remote plugins: only moduleUrl + config - code loads entirely in Worker isolation
  plugins: [
    {
      name: 'audit-log',
      moduleUrl: import.meta.resolve('@drizzle-cms/plugins/audit-log/worker'),
      config: auditLogConfig,
    },
  ],
  // Sandbox mode for plugin execution
  pluginSandbox,
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
