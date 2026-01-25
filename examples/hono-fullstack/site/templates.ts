// HTML templates for the public site
// Uses drizzle-cms/ui's html tagged template for XSS-safe rendering
import { html, raw } from '@drizzle-cms/ui';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SiteSettings {
  siteName: string;
  tagline: string;
  footerText: string;
}

export interface NavItem {
  title: string;
  slug: string;
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  published: boolean;
  createdAt: Date;
  author: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
}

export interface PostDetail extends PostSummary {
  content: string;
  contentHtml: string | null;
}

export interface PageDetail {
  id: number;
  title: string;
  slug: string;
  content: string;
  contentHtml: string | null;
}

export interface CategoryWithCount {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
}

export interface AuthorDetail {
  id: number;
  name: string;
  slug: string;
  bio: string | null;
  posts: PostSummary[];
}

// ─────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────

/**
 * Base layout wrapper for all pages
 */
export function layout(
  content: string,
  options: {
    title: string;
    settings: SiteSettings;
    navPages: NavItem[];
    categories: NavItem[];
  },
): string {
  const { title, settings, navPages, categories } = options;

  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title} | ${settings.siteName}</title>
        <link rel="stylesheet" href="/static/styles.css" />
      </head>
      <body>
        <header class="site-header">
          <div class="container">
            <a href="/" class="site-title">
              <h1>${settings.siteName}</h1>
              <p class="tagline">${settings.tagline}</p>
            </a>
            <nav class="main-nav">
              <a href="/">Home</a>
              ${raw(
                navPages.map((p) =>
                  html`
                    <a href="/page/${p.slug}">${p.title}</a>
                  `
                ).join(''),
              )}
              <a href="/categories">Categories</a>
            </nav>
          </div>
        </header>

        <main class="site-main">
          <div class="container">
            <div class="content-grid">
              <div class="main-content">${raw(content)}</div>
              <aside class="sidebar">
                <div class="widget">
                  <h3>Categories</h3>
                  <ul>
                    ${raw(
                      categories
                        .map(
                          (c) =>
                            html`
                              <li><a href="/category/${c.slug}">${c
                                .title}</a></li>
                            `,
                        )
                        .join(''),
                    )}
                  </ul>
                </div>
                <div class="widget">
                  <h3>Admin</h3>
                  <p><a href="/admin">→ CMS Dashboard</a></p>
                </div>
              </aside>
            </div>
          </div>
        </main>

        <footer class="site-footer">
          <div class="container">
            <p>${settings.footerText}</p>
            <p>
              Powered by <a href="https://github.com/your-org/drizzle-cms"
              >drizzle-cms</a> + <a href="https://hono.dev">Hono</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// Page Templates
// ─────────────────────────────────────────────────────────────

/**
 * Homepage - list of recent posts
 */
export function homePage(posts: PostSummary[]): string {
  if (posts.length === 0) {
    return html`
      <h2>Welcome</h2>
      <p>No posts yet. <a href="/admin">Create your first post</a> in the CMS.</p>
    `;
  }

  return html`
    <h2>Latest Posts</h2>
    <div class="post-list">
      ${raw(posts.map(postCard).join(''))}
    </div>
  `;
}

/**
 * Post card for listings
 */
function postCard(post: PostSummary): string {
  const date = formatDate(post.createdAt);

  return html`
    <article class="post-card">
      <h3><a href="/post/${post.slug}">${post.title}</a></h3>
      <div class="post-meta">
        <span class="date">${date}</span>
        ${post.author
          ? raw(html`
            <span class="author">by <a href="/author/${post.author.slug}">${post
              .author.name}</a></span>
          `)
          : ''} ${post.category
          ? raw(html`
            <span class="category">in <a href="/category/${post.category
              .slug}">${post.category.name}</a></span>
          `)
          : ''}
      </div>
      ${post.excerpt
        ? raw(html`
          <p class="excerpt">${post.excerpt}</p>
        `)
        : ''}
      <a href="/post/${post.slug}" class="read-more">Read more →</a>
    </article>
  `;
}

/**
 * Single post page
 */
export function postPage(post: PostDetail): string {
  const date = formatDate(post.createdAt);

  return html`
    <article class="post-full">
      <header class="post-header">
        <h1>${post.title}</h1>
        <div class="post-meta">
          <span class="date">${date}</span>
          ${post.author
            ? raw(html`
              <span class="author">by <a href="/author/${post.author
                .slug}">${post.author.name}</a></span>
            `)
            : ''} ${post.category
            ? raw(html`
              <span class="category">in <a href="/category/${post.category
                .slug}">${post.category.name}</a></span>
            `)
            : ''}
        </div>
      </header>
      <div class="post-content">
        ${raw(safeHtml(post.contentHtml, post.content))}
      </div>
      <footer class="post-footer">
        <a href="/">← Back to all posts</a>
      </footer>
    </article>
  `;
}

/**
 * Static page
 */
export function staticPage(page: PageDetail): string {
  return html`
    <article class="page">
      <h1>${page.title}</h1>
      <div class="page-content">
        ${raw(safeHtml(page.contentHtml, page.content))}
      </div>
    </article>
  `;
}

/**
 * Category page - posts in a category
 */
export function categoryPage(
  category: { name: string; slug: string; description: string | null },
  posts: PostSummary[],
): string {
  return html`
    <header class="category-header">
      <h1>Category: ${category.name}</h1>
      ${category.description
        ? raw(html`
          <p class="description">${category.description}</p>
        `)
        : ''}
    </header>
    ${posts.length > 0
      ? raw(html`
        <div class="post-list">${raw(posts.map(postCard).join(''))}</div>
      `)
      : raw(html`
        <p>No posts in this category yet.</p>
      `)}
    <p><a href="/categories">← All categories</a></p>
  `;
}

/**
 * Categories index page
 */
export function categoriesPage(categories: CategoryWithCount[]): string {
  return html`
    <h1>Categories</h1>
    <div class="categories-list">
      ${raw(
        categories
          .map(
            (c) =>
              html`
                <div class="category-card">
                  <h3><a href="/category/${c.slug}">${c.name}</a></h3>
                  ${c.description
                    ? raw(html`
                      <p>${c.description}</p>
                    `)
                    : ''}
                  <span class="post-count">${c
                    .postCount} post${c.postCount === 1 ? '' : 's'}</span>
                </div>
              `,
          )
          .join(''),
      )}
    </div>
  `;
}

/**
 * Author page
 */
export function authorPage(author: AuthorDetail): string {
  return html`
    <header class="author-header">
      <h1>${author.name}</h1>
      ${author.bio
        ? raw(html`
          <p class="bio">${author.bio}</p>
        `)
        : ''}
    </header>
    <h2>Posts by ${author.name}</h2>
    ${author.posts.length > 0
      ? raw(html`
        <div class="post-list">${raw(author.posts.map(postCard).join(''))}</div>
      `)
      : raw(html`
        <p>No posts by this author yet.</p>
      `)}
    <p><a href="/">← Back to home</a></p>
  `;
}

/**
 * 404 page
 */
export function notFoundPage(): string {
  return html`
    <div class="error-page">
      <h1>404 - Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/">← Go home</a>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Render Markdown to HTML using vendored snarkdown parser.
 * See ./markdown.ts for the vendored source.
 */
function renderMarkdown(text: string): string {
  return parseMarkdown(text);
}

/**
 * Safely render HTML content with XSS protection.
 * Defense in depth: sanitizes even pre-sanitized DB content.
 * Falls back to parsing markdown if contentHtml is empty.
 */
function safeHtml(contentHtml: string | null, markdownFallback: string): string {
  const html = contentHtml || renderMarkdown(markdownFallback);
  return sanitizeHtml(html);
}
