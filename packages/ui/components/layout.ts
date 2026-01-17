// Page layout component

import { html, raw } from '../html.ts';

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
  user?: { name: string; logoutUrl: string };
  /** URL to the stylesheet (default: 'styles.css') */
  stylesheetUrl?: string;
  /** Additional head content (CSS, meta tags) */
  head?: string;
  /** Additional body end content (scripts) */
  bodyEnd?: string;
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
  const itemsHtml = items.map(item => 
    html`<li class="cms-nav-item${raw(item.active ? ' active' : '')}">
      <a href="${item.href}">${raw(item.icon ?? '')}${item.label}</a>
    </li>`
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${html`${options.title}`} | ${html`${siteName}`}</title>
  ${defaultStyles(stylesheetUrl)}
  ${options.head ?? ''}
</head>
<body>
  <div class="cms-layout">
    <aside class="cms-sidebar">
      <div class="cms-sidebar-header">
        <h1 class="cms-sidebar-title">${html`${siteName}`}</h1>
      </div>
      ${navHtml}
    </aside>
    <main class="cms-main">
      <header class="cms-header">
        <h2>${html`${options.title}`}</h2>
        ${options.user ? html`<div class="cms-user">
          ${options.user.name}
          <form method="POST" action="${options.user.logoutUrl}" style="display:inline">
            <button type="submit" class="cms-btn cms-btn-secondary">Logout</button>
          </form>
        </div>` : ''}
      </header>
      <div class="cms-content">
        ${content}
      </div>
    </main>
  </div>
  ${options.bodyEnd ?? ''}
</body>
</html>`;
}
