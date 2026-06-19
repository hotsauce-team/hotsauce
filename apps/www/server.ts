// Minimal marketing site server
// No framework — just Deno's native fetch handler

import { eq } from 'drizzle-orm';
import { db } from './db.ts';
import { pages } from './schema.ts';
import { escapeHtml, layout, md } from './lib/render.ts';

import type { createAdminHandler } from './admin/admin.ts';

// Lazy-load CMS handler only when needed
let cmsHandler: ReturnType<typeof createAdminHandler> | null = null;

async function getCmsHandler() {
  if (!cmsHandler) {
    const { createAdminHandler } = await import('./admin/admin.ts');
    cmsHandler = createAdminHandler(db);
  }
  return cmsHandler;
}

// Build nav from pages (cached after first request)
let navCache: string | null = null;

// Invalidate nav cache when content changes (called after CMS edits)
export function invalidateNavCache() {
  navCache = null;
}

async function getNav(): Promise<string> {
  if (navCache) return navCache;
  const allPages = await db.select({ slug: pages.slug, title: pages.title })
    .from(pages)
    .orderBy(pages.sortOrder);
  navCache = allPages
    .map((p) => `<a href="/${p.slug}">${escapeHtml(p.title)}</a>`)
    .join('');
  return navCache;
}

// Route handlers
async function handlePage(slug: string): Promise<Response> {
  const [page] = await db.select().from(pages).where(eq(pages.slug, slug));
  if (!page) {
    return new Response('Not found', { status: 404 });
  }
  const nav = await getNav();
  const body = md(page.content);
  const html = layout(page.title, body, nav);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function handleHome(): Promise<Response> {
  // Home page is the page with slug 'home' or first page by sort order
  const [home] = await db.select().from(pages)
    .where(eq(pages.slug, 'home'))
    .limit(1);

  if (home) {
    const nav = await getNav();
    const body = md(home.content);
    const html = layout(home.title, body, nav);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Fallback if no home page exists
  const nav = await getNav();
  const html = layout(
    'hotsauce-cms',
    '<p>Welcome. Run <code>deno task seed</code> to add content.</p>',
    nav,
  );
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleNotFound(): Response {
  return new Response('Not found', { status: 404 });
}

// Export handler for `deno serve --parallel`
export default {
  fetch: async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // CMS admin routes
    if (path === '/admin' || path.startsWith('/admin/')) {
      const handler = await getCmsHandler();
      const response = await handler(request);
      // Invalidate nav cache after any POST (content might have changed)
      if (request.method === 'POST') {
        invalidateNavCache();
      }
      return response;
    }

    // Home
    if (path === '/') {
      return handleHome();
    }

    // Static slug pages
    const slugMatch = path.match(/^\/([a-z0-9-]+)$/);
    if (slugMatch) {
      return handlePage(slugMatch[1]);
    }

    return handleNotFound();
  },
};
