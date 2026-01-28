// Public site routes (Hono)
// These routes serve the public-facing blog pages
import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Database } from '../db.ts';
import { authors, categories, pages, posts, settings } from '../schema.ts';

import {
  type AuthorDetail,
  authorPage,
  categoriesPage,
  categoryPage,
  type CategoryWithCount,
  homePage,
  layout,
  type NavItem,
  notFoundPage,
  type PostDetail,
  postPage,
  type PostSummary,
  type SiteSettings,
  staticPage,
} from './templates.ts';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getSiteSettings(db: Database): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const settingsMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    siteName: settingsMap['site_name'] ?? 'My Blog',
    tagline: settingsMap['tagline'] ?? 'A blog powered by drizzle-cms',
    footerText: settingsMap['footer_text'] ?? '© 2026 My Blog',
  };
}

async function getNavPages(db: Database): Promise<NavItem[]> {
  const rows = await db
    .select({ title: pages.title, slug: pages.slug })
    .from(pages)
    .where(eq(pages.published, true))
    .orderBy(pages.sortOrder);

  return rows;
}

async function getNavCategories(db: Database): Promise<NavItem[]> {
  const rows = await db
    .select({ title: categories.name, slug: categories.slug })
    .from(categories)
    .orderBy(categories.sortOrder);

  return rows;
}

async function renderPage(
  db: Database,
  content: string,
  title: string,
): Promise<string> {
  const [siteSettings, navPages, navCategories] = await Promise.all([
    getSiteSettings(db),
    getNavPages(db),
    getNavCategories(db),
  ]);

  return layout(content, {
    title,
    settings: siteSettings,
    navPages,
    categories: navCategories,
  });
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

  /**
   * Homepage - list recent published posts
   */
  app.get('/', async (_c) => {
    const postList = await db.query.posts.findMany({
      where: eq(posts.published, true),
      orderBy: desc(posts.createdAt),
      limit: 10,
      with: {
        author: true,
        category: true,
      },
    });

    const postSummaries: PostSummary[] = postList.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      published: p.published,
      createdAt: p.createdAt,
      author: p.author ? { name: p.author.name, slug: p.author.slug } : null,
      category: p.category
        ? { name: p.category.name, slug: p.category.slug }
        : null,
    }));

    const content = homePage(postSummaries);
    const html = await renderPage(db, content, 'Home');
    return htmlResponse(html);
  });

  /**
   * Single post page
   */
  app.get('/post/:slug', async (c) => {
    const slug = c.req.param('slug');

    const post = await db.query.posts.findFirst({
      where: and(eq(posts.slug, slug), eq(posts.published, true)),
      with: {
        author: true,
        category: true,
      },
    });

    if (!post) {
      const content = notFoundPage();
      const html = await renderPage(db, content, 'Not Found');
      return htmlResponse(html, 404);
    }

    const postDetail: PostDetail = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      contentHtml: post.contentHtml,
      published: post.published,
      createdAt: post.createdAt,
      author: post.author
        ? { name: post.author.name, slug: post.author.slug }
        : null,
      category: post.category
        ? { name: post.category.name, slug: post.category.slug }
        : null,
    };

    const content = postPage(postDetail);
    const html = await renderPage(db, content, post.title);
    return htmlResponse(html);
  });

  /**
   * Static page (about, contact, etc.)
   */
  app.get('/page/:slug', async (c) => {
    const slug = c.req.param('slug');

    const page = await db.query.pages.findFirst({
      where: and(eq(pages.slug, slug), eq(pages.published, true)),
    });

    if (!page) {
      const content = notFoundPage();
      const html = await renderPage(db, content, 'Not Found');
      return htmlResponse(html, 404);
    }

    const content = staticPage({
      id: page.id,
      title: page.title,
      slug: page.slug,
      content: page.content,
      contentHtml: page.contentHtml,
    });
    const html = await renderPage(db, content, page.title);
    return htmlResponse(html);
  });

  /**
   * Category page - posts in a category
   */
  app.get('/category/:slug', async (c) => {
    const slug = c.req.param('slug');

    const category = await db.query.categories.findFirst({
      where: eq(categories.slug, slug),
    });

    if (!category) {
      const content = notFoundPage();
      const html = await renderPage(db, content, 'Not Found');
      return htmlResponse(html, 404);
    }

    const postList = await db.query.posts.findMany({
      where: and(eq(posts.categoryId, category.id), eq(posts.published, true)),
      orderBy: desc(posts.createdAt),
      with: {
        author: true,
        category: true,
      },
    });

    const postSummaries: PostSummary[] = postList.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      published: p.published,
      createdAt: p.createdAt,
      author: p.author ? { name: p.author.name, slug: p.author.slug } : null,
      category: p.category
        ? { name: p.category.name, slug: p.category.slug }
        : null,
    }));

    const content = categoryPage(
      {
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      postSummaries,
    );
    const html = await renderPage(db, content, `Category: ${category.name}`);
    return htmlResponse(html);
  });

  /**
   * Categories index page
   */
  app.get('/categories', async (_c) => {
    const categoryList = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        postCount: sql<number>`count(${posts.id})::int`,
      })
      .from(categories)
      .leftJoin(
        posts,
        and(eq(posts.categoryId, categories.id), eq(posts.published, true)),
      )
      .groupBy(categories.id)
      .orderBy(categories.sortOrder);

    const categoriesWithCount: CategoryWithCount[] = categoryList.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      postCount: c.postCount ?? 0,
    }));

    const content = categoriesPage(categoriesWithCount);
    const html = await renderPage(db, content, 'Categories');
    return htmlResponse(html);
  });

  /**
   * Author page
   */
  app.get('/author/:slug', async (c) => {
    const slug = c.req.param('slug');

    const author = await db.query.authors.findFirst({
      where: eq(authors.slug, slug),
    });

    if (!author) {
      const content = notFoundPage();
      const html = await renderPage(db, content, 'Not Found');
      return htmlResponse(html, 404);
    }

    const postList = await db.query.posts.findMany({
      where: and(eq(posts.authorId, author.id), eq(posts.published, true)),
      orderBy: desc(posts.createdAt),
      with: {
        author: true,
        category: true,
      },
    });

    const postSummaries: PostSummary[] = postList.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      published: p.published,
      createdAt: p.createdAt,
      author: p.author ? { name: p.author.name, slug: p.author.slug } : null,
      category: p.category
        ? { name: p.category.name, slug: p.category.slug }
        : null,
    }));

    const authorDetail: AuthorDetail = {
      id: author.id,
      name: author.name,
      slug: author.slug,
      bio: author.bio,
      posts: postSummaries,
    };

    const content = authorPage(authorDetail);
    const html = await renderPage(db, content, author.name);
    return htmlResponse(html);
  });

  /**
   * 404 handler for site routes
   */
  app.notFound(async () => {
    const content = notFoundPage();
    const html = await renderPage(db, content, 'Not Found');
    return htmlResponse(html, 404);
  });

  return app;
}
