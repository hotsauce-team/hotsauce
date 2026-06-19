// Public site routes — Spice Rack hot sauce catalogue
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import {
  buildObjectUrl,
  presignUrl,
} from '@hotsauce/plugins/s3-storage/signing';
import { getDemoS3Config } from '../lib/s3-config.ts';

import type { Database } from '../db.ts';
import { makers, media, pages, sauces, settings } from '../schema.ts';
import { renderPuckContent } from './puck-render.tsx';

import {
  homePage,
  layout,
  type MakerDetail,
  makerPage,
  type NavItem,
  notFoundPage,
  type SauceDetail,
  saucePage,
  type SauceSummary,
  type SiteSettings,
  visualPage,
} from './templates.ts';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getSiteSettings(db: Database): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    siteName: map['site_name'] ?? 'The Spice Rack',
    tagline: map['tagline'] ?? '',
    footerText: map['footer_text'] ?? '',
    demoBanner: map['demo_banner'] ?? '',
  };
}

function getNavPages(db: Database): Promise<NavItem[]> {
  return db
    .select({ title: pages.title, slug: pages.slug })
    .from(pages)
    .where(eq(pages.published, true))
    .orderBy(pages.sortOrder);
}

async function renderPage(
  db: Database,
  content: string,
  title: string,
): Promise<string> {
  const [siteSettings, navPages] = await Promise.all([
    getSiteSettings(db),
    getNavPages(db),
  ]);
  return layout(content, { title, settings: siteSettings, navPages });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────

export function createSiteRoutes(db: Database): Hono {
  const app = new Hono();
  const s3 = getDemoS3Config();

  /** Homepage — sauce grid */
  app.get('/', async (_c) => {
    const rows = await db.query.sauces.findMany({
      where: eq(sauces.published, true),
      orderBy: asc(sauces.name),
      with: { maker: true },
    });

    const summaries: SauceSummary[] = rows.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      heat: s.heat,
      scoville: s.scoville,
      bottle: s.bottle,
      makerName: s.maker.name,
      makerSlug: s.maker.slug,
    }));

    const content = homePage(summaries);
    const page = await renderPage(db, content, 'Home');
    return htmlResponse(page);
  });

  /** Single sauce page */
  app.get('/sauce/:slug', async (c) => {
    const slug = c.req.param('slug');
    const row = await db.query.sauces.findFirst({
      where: and(eq(sauces.slug, slug), eq(sauces.published, true)),
      with: { maker: true },
    });

    if (!row) {
      const content = notFoundPage();
      const page = await renderPage(db, content, 'Not Found');
      return htmlResponse(page, 404);
    }

    const detail: SauceDetail = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      heat: row.heat,
      scoville: row.scoville,
      bottle: row.bottle,
      makerName: row.maker.name,
      makerSlug: row.maker.slug,
      tastingNotes: row.tastingNotes,
      tastingNotesHtml: row.tastingNotesHtml,
      published: row.published,
    };

    const content = saucePage(detail);
    const page = await renderPage(db, content, row.name);
    return htmlResponse(page);
  });

  /** Maker profile — bio + sauce list */
  app.get('/maker/:slug', async (c) => {
    const slug = c.req.param('slug');
    const maker = await db.query.makers.findFirst({
      where: eq(makers.slug, slug),
      with: {
        sauces: {
          where: eq(sauces.published, true),
          orderBy: asc(sauces.name),
        },
      },
    });

    if (!maker) {
      const content = notFoundPage();
      const page = await renderPage(db, content, 'Not Found');
      return htmlResponse(page, 404);
    }

    const detail: MakerDetail = {
      id: maker.id,
      name: maker.name,
      slug: maker.slug,
      bio: maker.bio,
      bioHtml: maker.bioHtml,
      logo: maker.logo,
      website: maker.website,
      sauces: maker.sauces.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        heat: s.heat,
        scoville: s.scoville,
        bottle: s.bottle,
        makerName: maker.name,
        makerSlug: maker.slug,
      })),
    };

    const content = makerPage(detail);
    const page = await renderPage(db, content, maker.name);
    return htmlResponse(page);
  });

  /**
   * Public file serving for published media
   * Accepts optional filename at end: /files/media/136/sunset.jpg
   * The filename is ignored for lookup — we use the id.
   */
  app.get('/files/media/:id/:filename?', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return c.notFound();

    const [item] = await db.select().from(media).where(
      eq(media.id, id),
    ).limit(1);
    if (!item?.published || !item.file) return c.notFound();

    const file = item.file;

    // Object storage — presign and redirect
    if (file.key && s3) {
      try {
        const objectUrl = buildObjectUrl(
          s3.publicEndpoint,
          s3.bucket,
          file.key,
          s3.urlStyle,
        );
        const signedUrl = await presignUrl({
          method: 'GET',
          url: objectUrl,
          region: s3.region,
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
          expirySeconds: 900,
        });
        return c.redirect(signedUrl);
      } catch {
        // Invalid object-storage config or signing failure — fall through
        // to the inline data / 404 path instead of returning a 500.
      }
    }

    // Inline base64 — decode and serve
    if (file.data) {
      const bytes = Uint8Array.from(atob(file.data), (ch) => ch.charCodeAt(0));
      const contentType = (file.contentType || 'application/octet-stream')
        .toLowerCase();
      const filename = file.filename || 'file';

      const isImage = contentType.startsWith('image/');
      const isSvg = contentType === 'image/svg+xml' ||
        contentType.endsWith('+svg');
      const disposition = isImage && !isSvg ? 'inline' : 'attachment';

      return new Response(bytes, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `${disposition}; filename="${
            encodeURIComponent(filename)
          }"`,
          'Content-Security-Policy':
            "default-src 'none'; img-src 'self' data:; style-src 'none'; script-src 'none'; form-action 'none'; frame-ancestors 'none'; sandbox",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
    }

    return c.notFound();
  });

  /**
   * Visual page (Puck editor content)
   * Must be registered last — catches /:slug after more-specific routes.
   */
  app.get('/:slug', async (c) => {
    const slug = c.req.param('slug');

    const page = await db.query.pages.findFirst({
      where: and(eq(pages.slug, slug), eq(pages.published, true)),
    });

    if (!page) {
      const content = notFoundPage();
      const html = await renderPage(db, content, 'Not Found');
      return htmlResponse(html, 404);
    }

    const renderedHtml = await renderPuckContent(
      // deno-lint-ignore no-explicit-any
      page.content as unknown as any,
    );

    const content = visualPage({
      id: page.id,
      title: page.title,
      slug: page.slug,
      renderedHtml,
    });
    const html = await renderPage(db, content, page.title ?? 'Page');
    return htmlResponse(html);
  });

  /** 404 handler */
  app.notFound(async () => {
    const content = notFoundPage();
    const html = await renderPage(db, content, 'Not Found');
    return htmlResponse(html, 404);
  });

  return app;
}
