// Server entry point
// Combines public site routes + CMS admin into one Hono server
// deno-lint-ignore-file no-console

import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import { db } from './db.ts';
import { createSiteRoutes } from './site/routes.ts';
import { securityHeaders } from './security.ts';
import { createAdminHandler } from './admin/admin.ts';

// ─────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────

const app = new Hono();

// Static files (CSS, images, etc.)
app.use('/static/*', serveStatic({ root: './site' }));

// Security headers for public site (not admin - CMS has its own)
app.use('*', (c, next) => {
  // Skip CSP for admin routes (CMS has inline styles)
  if (c.req.path.startsWith('/admin')) {
    return next();
  }
  return securityHeaders(c, next);
});

// Public site routes (/, /post/:slug, /page/:slug, etc.)
const siteRoutes = createSiteRoutes(db);
app.route('/', siteRoutes);

// CMS admin routes (/admin/*)
const cmsHandler = createAdminHandler(db);
app.all('/admin/*', (c) => cmsHandler(c.req.raw));
app.all('/admin', (c) => cmsHandler(c.req.raw));

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

const PORT = 3000;

console.log(`🚀 Site running at http://localhost:${PORT}`);
console.log(`📝 CMS admin at http://localhost:${PORT}/admin`);
console.log(`   Run 'deno task seed' first to set up the database`);

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, app.fetch);
