// Page layout component

import { escapeHtml, html, raw } from '../html.ts';
import { alert, type AlertType } from './alert.ts';

/**
 * Navigation item
 */
export interface NavItem {
  /** Display label */
  label: string;
  /** URL */
  href: string;
  /** Whether this item is active */
  active?: boolean;
  /** Icon (optional, HTML string) */
  icon?: string;
}

/**
 * Options for page layout
 */
export interface LayoutOptions {
  /** Page title */
  title: string;
  /** Site/app name */
  siteName?: string;
  /** Navigation items */
  nav?: NavItem[];
  /** User info for header */
  user?: { name: string; logoutUrl: string; accountUrl?: string };
  /** URL to the stylesheet (default: 'styles.css') */
  stylesheetUrl?: string;
  /** URL to the script (e.g., 'admin.js') */
  scriptUrl?: string;
  /** Additional head content (CSS, meta tags) */
  head?: string;
  /**
   * Flash messages rendered at the top of the page content area.
   * Each entry becomes a separate alert banner above the page content.
   */
  flashes?: Array<{ type: AlertType; message: string }>;
}

/**
 * Default CSS styles for the CMS
 *
 * Returns a <link> tag pointing to the external stylesheet.
 * The stylesheet is served at `{basePath}/styles.css` by the handlers package.
 *
 * This approach enables strict Content Security Policy (style-src 'self')
 * without requiring nonces.
 *
 * @param stylesheetUrl - URL to the stylesheet (default: 'styles.css')
 */
export function defaultStyles(stylesheetUrl = 'styles.css'): string {
  return `<link rel="stylesheet" href="${stylesheetUrl}">`;
}

/**
 * Render navigation list
 */
export function nav(items: NavItem[]): string {
  const itemsHtml = items.map((item) =>
    html`
      <li class="cms-nav-item${raw(item.active ? ' active' : '')}">
        <a href="${item.href}">${raw(item.icon ?? '')}${item.label}</a>
      </li>
    `
  ).join('\n    ');

  return `<ul class="cms-nav">
    ${itemsHtml}
  </ul>`;
}

/**
 * Render a complete page layout
 */
export function layout(content: string, options: LayoutOptions): string {
  const siteName = options.siteName ?? 'CMS';
  const navHtml = options.nav ? nav(options.nav) : '';
  const stylesheetUrl = options.stylesheetUrl ?? 'styles.css';
  const scriptTag = options.scriptUrl
    ? `<script src="${escapeHtml(options.scriptUrl)}"></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${html`
    ${options.title}
  `} | ${html`
    ${siteName}
  `}</title>
  ${defaultStyles(stylesheetUrl)}
  ${options.head ?? ''}
</head>
<body>
  <div class="cms-layout">
    <aside id="cms-nav" class="cms-sidebar" popover>
      <div class="cms-sidebar-header">
        <h1 class="cms-sidebar-title">${html`
    ${siteName}
  `}</h1>
      </div>
      ${navHtml}
    </aside>
    <main class="cms-main">
      <header class="cms-header">
        <button class="cms-menu-toggle" popovertarget="cms-nav" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <h2>${html`
    ${options.title}
  `}</h2>
        ${
    options.user
      ? html`
        <div class="cms-user">
          <span class="cms-user-name">${options.user.name}</span>
          ${raw(
            options.user.accountUrl
              ? `<a href="${
                escapeHtml(options.user.accountUrl)
              }" class="cms-btn cms-btn-secondary">Account</a>`
              : '',
          )}
          <form method="POST" action="${options.user
            .logoutUrl}" class="cms-inline-form">
            <button type="submit" class="cms-btn cms-btn-secondary">Logout</button>
          </form>
        </div>
      `
      : ''
  }
      </header>
      <div class="cms-content">
        ${(options.flashes ?? []).map((f) => alert(f.message, f.type)).join('')}
        ${content}
      </div>
    </main>
  </div>
  ${scriptTag}
</body>
</html>`;
}
