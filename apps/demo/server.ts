// Server entry point
// Combines public site routes + CMS admin into one Hono server
// deno-lint-ignore-file no-console

import process from 'node:process';
import { Hono } from 'hono';
import { serveStatic } from 'hono/deno';
import { db } from './db.ts';
import { createSiteRoutes } from './site/routes.ts';
import { createSecurityHeaders } from './security.ts';
import { getDemoS3Config } from './lib/s3-config.ts';

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
const s3Config = getDemoS3Config();
const securityHeaders = createSecurityHeaders(
  s3Config ? [s3Config.publicEndpoint] : [],
);
app.use('*', (c, next) => {
  // Skip CSP for admin routes (CMS has inline styles)
  if (c.req.path.startsWith('/admin')) {
    return next();
  }
  return securityHeaders(c, next);
});

// Demo mode: block all writes except login/logout.
// Writes are only allowed when running locally (NODE_ENV=local).
if (process.env.NODE_ENV !== 'local') {
  app.use('/admin/*', (c, next) => {
    if (c.req.method !== 'POST') return next();
    const pathname = new URL(c.req.url).pathname;
    if (pathname.endsWith('/login') || pathname.endsWith('/logout')) {
      return next();
    }
    // Redirect back to the page that submitted the form (the edit/create page).
    // Use only the pathname from Referer to prevent open redirect attacks.
    const raw = c.req.header('referer') ?? c.req.url;
    let redirectTo: string;
    try {
      redirectTo = new URL(raw).pathname;
    } catch {
      redirectTo = '/admin';
    }
    return Promise.resolve(c.redirect(redirectTo, 303));
  });
}

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
// Export for deno serve
// ─────────────────────────────────────────────────────────────

console.log(`🚀 Site running at http://localhost:3000`);
console.log(`📝 CMS admin at http://localhost:3000/admin`);
console.log(`   Run 'deno task seed' first to set up the database`);

export default app;
