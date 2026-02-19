// Server entry point
// Combines public site routes + CMS admin into one Hono server
// deno-lint-ignore-file no-console

import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import { db } from './db.ts';
import { createSiteRoutes } from './site/routes.ts';
import { securityHeaders } from './security.ts';

// ─────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────

const app = new Hono();

// Static files (CSS, images, etc.)
app.use('/static/*', serveStatic({ root: './site' }));

// Puck components bundle (built with: deno task build:components)
app.get('/admin/components.js', async (c) => {
  try {
    const content = await Deno.readTextFile('./admin/components.js');
    return c.body(content, 200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
  } catch {
    return c.text(
      'Components bundle not found. Run: deno task build:components',
      404,
    );
  }
});

// Security headers for public site (not admin - CMS has its own)
app.use('*', (c, next) => {
  // Skip CSP for admin routes (CMS has inline styles)
  if (c.req.path.startsWith('/admin')) {
    return next();
  }
  return securityHeaders(c, next);
});

// CMS admin routes (/admin/*) - lazy loaded for serverless efficiency
// Only imports @hotsauce/cms when admin routes are accessed
let cmsHandler: ((req: Request) => Response | Promise<Response>) | null = null;

async function getCmsHandler() {
  if (!cmsHandler) {
    const { createAdminHandler } = await import('./admin/admin.ts');
    cmsHandler = createAdminHandler(db);
  }
  return cmsHandler;
}

app.all('/admin/*', async (c) => {
  const handler = await getCmsHandler();
  return handler(c.req.raw);
});
app.all('/admin', async (c) => {
  const handler = await getCmsHandler();
  return handler(c.req.raw);
});

// Public site routes (/, /post/:slug, /:slug for pages, etc.)
const siteRoutes = createSiteRoutes(db);
app.route('/', siteRoutes);

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

const PORT = 3000;
const HOST = Deno.env.get('HOST') || '127.0.0.1';

console.log(`🚀 Site running at http://localhost:${PORT}`);
console.log(`📝 CMS admin at http://localhost:${PORT}/admin`);
console.log(`   Run 'deno task seed' first to set up the database`);

Deno.serve({ port: PORT, hostname: HOST }, app.fetch);
