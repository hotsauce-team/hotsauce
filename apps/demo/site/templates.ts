// HTML templates for the Spice Rack public site
import { html, raw } from '@hotsauce/ui';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';
import { ROBOTS_DIRECTIVE } from '../security.ts';
import type { FileReference } from '@hotsauce/core/extend';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SiteSettings {
  siteName: string;
  tagline: string;
  footerText: string;
  demoBanner: string;
}

export interface NavItem {
  title: string | null;
  slug: string | null;
}

export interface SauceSummary {
  id: number;
  name: string;
  slug: string;
  heat: number;
  scoville: number | null;
  bottle: FileReference | null;
  makerName: string;
  makerSlug: string;
}

export interface SauceDetail extends SauceSummary {
  tastingNotes: string;
  tastingNotesHtml: string | null;
  published: boolean;
}

export interface MakerDetail {
  id: number;
  name: string;
  slug: string;
  bio: string | null;
  bioHtml: string | null;
  logo: FileReference | null;
  website: string | null;
  sauces: SauceSummary[];
}

export interface PageDetail {
  id: number;
  title: string | null;
  slug: string | null;
  /** Pre-rendered HTML from Puck content */
  renderedHtml: string;
}

// ─────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────

export function layout(
  content: string,
  options: {
    title: string;
    settings: SiteSettings;
    navPages: NavItem[];
  },
): string {
  const { title, settings, navPages } = options;

  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="${ROBOTS_DIRECTIVE}" />
        <meta name="googlebot" content="${ROBOTS_DIRECTIVE}" />
        <title>${title} | ${settings.siteName}</title>
        <link rel="stylesheet" href="/static/styles.css" />
        <link rel="stylesheet" href="/static/components.css" />
      </head>
      <body>
        ${settings.demoBanner
          ? raw(html`
            <div class="demo-banner">
              ${settings.demoBanner}
              <a href="/admin" class="demo-banner-link">→ Admin</a>
            </div>
          `)
          : ''}
        <header class="site-header">
          <div class="container">
            <a href="/" class="site-title">
              <h1>${settings.siteName}</h1>
              <p class="tagline">${settings.tagline}</p>
            </a>
            <nav class="main-nav">
              <a href="/">Sauces</a>
              ${raw(
                navPages
                  .filter((p) => p.slug && p.title)
                  .map((p) =>
                    html`
                      <a href="/${p.slug}">${p.title}</a>
                    `
                  )
                  .join(''),
              )}
              <a href="/admin">Admin →</a>
            </nav>
          </div>
        </header>

        <main class="site-main">
          <div class="container">
            ${raw(content)}
          </div>
        </main>

        <footer class="site-footer">
          <div class="container">
            <p>${settings.footerText}</p>
            <p>
              Powered by <a href="https://github.com/hotsauce-team/hotsauce"
              >hotsauce-cms</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  `;
}

// ─────────────────────────────────────────────────────────────
// Sauce templates
// ─────────────────────────────────────────────────────────────

export function homePage(sauces: SauceSummary[]): string {
  if (sauces.length === 0) {
    return html`
      <h2>The Rack is Empty</h2>
      <p>No sauces yet. <a href="/admin">Add the first one</a> in the CMS.</p>
    `;
  }

  return html`
    <h2>The Collection</h2>
    <div class="sauce-grid">
      ${raw(sauces.map(sauceCard).join(''))}
    </div>
  `;
}

function sauceCard(sauce: SauceSummary): string {
  return html`
    <a href="/sauce/${sauce.slug}" class="sauce-card">
      <div class="bottle-wrap">
        ${raw(bottleImg(sauce.bottle, sauce.name))}
      </div>
      <div class="sauce-card-body">
        <h3 class="sauce-name">${sauce.name}</h3>
        <div class="heat-meta">
          ${raw(heatDots(sauce.heat))} ${sauce.scoville
            ? raw(html`
              <span class="scoville">${formatScoville(sauce.scoville)}</span>
            `)
            : ''}
        </div>
        <p class="maker-name">by <strong>${sauce.makerName}</strong></p>
      </div>
    </a>
  `;
}

export function saucePage(sauce: SauceDetail): string {
  return html`
    <article class="sauce-full">
      <div class="sauce-full-header">
        <div class="bottle-wrap bottle-wrap--large">
          ${raw(bottleImg(sauce.bottle, sauce.name))}
        </div>
        <div class="sauce-full-info">
          <h1>${sauce.name}</h1>
          <p class="maker-name">
            by <a href="/maker/${sauce.makerSlug}">${sauce.makerName}</a>
          </p>
          <div class="heat-meta heat-meta--large">
            ${raw(heatDots(sauce.heat))}
            <span class="heat-label">${sauce.heat}/10</span>
            ${sauce.scoville
              ? raw(html`
                <span class="scoville">${formatScoville(sauce.scoville)}</span>
              `)
              : ''}
          </div>
        </div>
      </div>
      <div class="tasting-notes">
        <h2>Tasting Notes</h2>
        <div class="prose">
          ${raw(safeHtml(sauce.tastingNotesHtml, sauce.tastingNotes))}
        </div>
      </div>
      <footer class="sauce-footer">
        <a href="/">← All sauces</a>
      </footer>
    </article>
  `;
}

// ─────────────────────────────────────────────────────────────
// Maker template
// ─────────────────────────────────────────────────────────────

export function makerPage(maker: MakerDetail): string {
  return html`
    <article class="maker-profile">
      <header class="maker-header">
        ${maker.logo
          ? raw(html`
            <div class="maker-logo-wrap">
              ${raw(logoImg(maker.logo, maker.name))}
            </div>
          `)
          : ''}
        <div class="maker-header-info">
          <h1>${maker.name}</h1>
          ${maker.website
            ? raw(html`
              <p><a href="${maker.website}" rel="noopener noreferrer">${maker
                .website}</a></p>
            `)
            : ''}
        </div>
      </header>
      ${maker.bioHtml || maker.bio
        ? raw(html`
          <div class="maker-bio prose">
            ${raw(safeHtml(maker.bioHtml, maker.bio ?? ''))}
          </div>
        `)
        : ''}
      <section class="maker-sauces">
        <h2>Sauces (${maker.sauces.length})</h2>
        <div class="sauce-grid">
          ${raw(maker.sauces.map(sauceCard).join(''))}
        </div>
      </section>
      <footer class="maker-footer">
        <a href="/">← All sauces</a>
      </footer>
    </article>
  `;
}

// ─────────────────────────────────────────────────────────────
// Visual page (Puck)
// ─────────────────────────────────────────────────────────────

export function visualPage(page: PageDetail): string {
  return html`
    <article class="page">
      ${page.title
        ? raw(html`
          <h1>${page.title}</h1>
        `)
        : ''}
      <div class="page-content puck-content">
        ${raw(page.renderedHtml)}
      </div>
    </article>
  `;
}

// ─────────────────────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────────────────────

export function notFoundPage(): string {
  return html`
    <div class="error-page">
      <h1>404 — Not Found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a href="/">← Go home</a>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function heatDots(heat: number): string {
  const clamped = Math.max(0, Math.min(heat, 10));
  return html`
    <span class="heat-dots" title="${heat}/10">${'🌶'.repeat(clamped)}</span>
  `;
}

function formatScoville(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M SHU`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K SHU`;
  return `${n} SHU`;
}

function bottleImg(bottle: FileReference | null, name: string): string {
  if (!bottle) {
    return html`
      <div class="bottle-placeholder"></div>
    `;
  }
  const src = bottle.data
    ? `data:${bottle.contentType ?? 'image/png'};base64,${bottle.data}`
    : bottle.url ?? '';
  if (!src) {
    return html`
      <div class="bottle-placeholder"></div>
    `;
  }
  return html`
    <img src="${src}" alt="${name}" class="bottle-img" loading="lazy" />
  `;
}

function logoImg(logo: FileReference | null, name: string): string {
  if (!logo) return '';
  const src = logo.data
    ? `data:${logo.contentType ?? 'image/png'};base64,${logo.data}`
    : logo.url ?? '';
  if (!src) return '';
  return html`
    <img
      src="${src}"
      alt="${name} logo"
      class="maker-logo"
      loading="lazy"
    />
  `;
}

/**
 * Safely render HTML content with XSS protection.
 * Falls back to parsing markdown if contentHtml is empty.
 */
function safeHtml(
  contentHtml: string | null,
  markdownFallback: string,
): string {
  const source = contentHtml || parseMarkdown(markdownFallback);
  return sanitizeHtml(source);
}
