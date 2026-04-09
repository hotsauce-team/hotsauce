// View toggle component for switching between grid and table views

import { attrs, html } from '../html.ts';

/**
 * Options for the view toggle component
 */
export interface ViewToggleOptions {
  /** Currently active view */
  currentView: 'grid' | 'table';
  /** Current URL (used to build toggle links) */
  currentUrl: string;
}

/**
 * Render the view toggle buttons (grid/table)
 */
export function viewToggle(options: ViewToggleOptions): string {
  const { currentView, currentUrl } = options;

  // Build toggle URLs by replacing/adding the view param
  const url = new URL(currentUrl, 'http://localhost');
  url.searchParams.set('view', 'grid');
  const gridUrl = `${url.pathname}${url.search}`;
  url.searchParams.set('view', 'table');
  const tableUrl = `${url.pathname}${url.search}`;

  const gridActive = currentView === 'grid' ? ' cms-view-toggle-active' : '';
  const tableActive = currentView === 'table' ? ' cms-view-toggle-active' : '';

  return html`
    <div class="cms-view-toggle">
      <a ${attrs({
        href: gridUrl,
        class: `cms-view-toggle-btn${gridActive}`,
        title: 'Grid view',
        'aria-label': 'Grid view',
      })}>▦</a>
      <a ${attrs({
        href: tableUrl,
        class: `cms-view-toggle-btn${tableActive}`,
        title: 'Table view',
        'aria-label': 'Table view',
      })}>☰</a>
    </div>
  `;
}
