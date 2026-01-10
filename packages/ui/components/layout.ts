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
  /** Additional head content (CSS, meta tags) */
  head?: string;
  /** Additional body end content (scripts) */
  bodyEnd?: string;
}

/**
 * Default CSS styles for the CMS
 */
export function defaultStyles(): string {
  return `<style>
  :root {
    --cms-primary: #2563eb;
    --cms-primary-hover: #1d4ed8;
    --cms-danger: #dc2626;
    --cms-danger-hover: #b91c1c;
    --cms-success: #16a34a;
    --cms-gray-50: #f9fafb;
    --cms-gray-100: #f3f4f6;
    --cms-gray-200: #e5e7eb;
    --cms-gray-300: #d1d5db;
    --cms-gray-500: #6b7280;
    --cms-gray-700: #374151;
    --cms-gray-900: #111827;
    --cms-radius: 6px;
    --cms-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  
  * { box-sizing: border-box; }
  
  body {
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.5;
    color: var(--cms-gray-900);
    background: var(--cms-gray-50);
    margin: 0;
  }
  
  .cms-layout {
    display: flex;
    min-height: 100vh;
  }
  
  .cms-sidebar {
    width: 240px;
    background: var(--cms-gray-900);
    color: white;
    padding: 1rem 0;
    flex-shrink: 0;
  }
  
  .cms-sidebar-header {
    padding: 0 1rem 1rem;
    border-bottom: 1px solid var(--cms-gray-700);
    margin-bottom: 1rem;
  }
  
  .cms-sidebar-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }
  
  .cms-nav { list-style: none; margin: 0; padding: 0; }
  
  .cms-nav-item a {
    display: block;
    padding: 0.5rem 1rem;
    color: var(--cms-gray-300);
    text-decoration: none;
    transition: background 0.15s;
  }
  
  .cms-nav-item a:hover,
  .cms-nav-item.active a {
    background: var(--cms-gray-700);
    color: white;
  }
  
  .cms-main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  
  .cms-header {
    background: white;
    border-bottom: 1px solid var(--cms-gray-200);
    padding: 1rem 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .cms-content {
    padding: 1.5rem;
    flex: 1;
  }
  
  /* Buttons */
  .cms-btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: var(--cms-radius);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .cms-btn-primary {
    background: var(--cms-primary);
    color: white;
  }
  .cms-btn-primary:hover { background: var(--cms-primary-hover); }
  
  .cms-btn-secondary {
    background: var(--cms-gray-200);
    color: var(--cms-gray-700);
  }
  .cms-btn-secondary:hover { background: var(--cms-gray-300); }
  
  .cms-btn-danger {
    background: var(--cms-danger);
    color: white;
  }
  .cms-btn-danger:hover { background: var(--cms-danger-hover); }
  
  /* Forms */
  .cms-form { max-width: 640px; }
  
  .cms-field {
    margin-bottom: 1rem;
  }
  
  .cms-label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: var(--cms-gray-700);
  }
  
  .cms-required { color: var(--cms-danger); margin-left: 2px; }
  
  .cms-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--cms-gray-300);
    border-radius: var(--cms-radius);
    font-size: 1rem;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  
  .cms-input:focus {
    outline: none;
    border-color: var(--cms-primary);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  
  .cms-input:disabled {
    background: var(--cms-gray-100);
    cursor: not-allowed;
  }
  
  .cms-checkbox { width: auto; }
  
  .cms-textarea, .cms-json {
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
  }
  
  .cms-json { font-family: monospace; font-size: 0.875rem; }
  
  .cms-error { color: var(--cms-danger); font-size: 0.875rem; margin: 0.25rem 0 0; }
  .cms-help { color: var(--cms-gray-500); font-size: 0.875rem; margin: 0.25rem 0 0; }
  
  .cms-field-error .cms-input {
    border-color: var(--cms-danger);
  }
  
  .cms-form-actions {
    margin-top: 1.5rem;
    display: flex;
    gap: 0.5rem;
  }
  
  /* Tables */
  .cms-table {
    width: 100%;
    background: white;
    border-radius: var(--cms-radius);
    box-shadow: var(--cms-shadow);
    border-collapse: collapse;
  }
  
  .cms-th {
    text-align: left;
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: var(--cms-gray-700);
    background: var(--cms-gray-50);
    border-bottom: 2px solid var(--cms-gray-200);
  }
  
  .cms-td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--cms-gray-200);
  }
  
  .cms-tr:hover { background: var(--cms-gray-50); }
  
  .cms-actions { white-space: nowrap; }
  
  .cms-action {
    color: var(--cms-primary);
    text-decoration: none;
    font-size: 0.875rem;
    margin-right: 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .cms-action:hover { text-decoration: underline; }
  .cms-action-delete { color: var(--cms-danger); }
  .cms-action-form { display: inline; }
  
  .cms-null { color: var(--cms-gray-500); }
  .cms-bool-true { color: var(--cms-success); }
  .cms-bool-false { color: var(--cms-gray-500); }
  
  /* Views */
  .cms-list-header, .cms-detail-header, .cms-edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .cms-list-header h1, .cms-detail-header h1, .cms-edit-header h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  .cms-detail-actions { display: flex; gap: 0.5rem; }
  .cms-inline-form { display: inline; }
  
  .cms-detail-list {
    background: white;
    border-radius: var(--cms-radius);
    box-shadow: var(--cms-shadow);
    padding: 1.5rem;
    margin: 0;
  }
  
  .cms-detail-field {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--cms-gray-200);
  }
  
  .cms-detail-field:last-child { border-bottom: none; }
  
  .cms-detail-label {
    font-weight: 500;
    color: var(--cms-gray-700);
  }
  
  .cms-detail-value { margin: 0; }
  .cms-detail-value pre { margin: 0; overflow-x: auto; }
  
  .cms-empty {
    text-align: center;
    padding: 3rem;
    background: white;
    border-radius: var(--cms-radius);
    box-shadow: var(--cms-shadow);
  }
  
  .cms-empty p {
    color: var(--cms-gray-500);
    margin: 0 0 1rem;
  }
</style>`;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${html`${options.title}`} | ${html`${siteName}`}</title>
  ${defaultStyles()}
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
          <a href="${options.user.logoutUrl}" class="cms-btn cms-btn-secondary">Logout</a>
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
