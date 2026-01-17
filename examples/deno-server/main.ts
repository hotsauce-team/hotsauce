// deno-lint-ignore-file no-console
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createCmsHandler, PasswordProvider } from '../../packages/handlers/mod.ts';
import { schema, users } from './schema.ts';

// Database connection (persisted to ./data)
const client = new PGlite('./data');
const db = drizzle(client, { schema });

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
