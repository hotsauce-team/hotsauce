// Pagination component

import { html } from '../html.ts';

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Base URL (page number will be appended as ?page=N) */
  baseUrl: string;
  /** Query param name (default: page) */
  paramName?: string;
}

/**
 * Render pagination controls
 */
export function pagination(options: PaginationOptions): string {
  const { page, totalPages, baseUrl } = options;
  const paramName = options.paramName ?? 'page';
  
  if (totalPages <= 1) {
    return '';
  }

  function pageUrl(p: number): string {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${paramName}=${p}`;
  }

  const items: string[] = [];

  // Previous button
  if (page > 1) {
    items.push(html`<a href="${pageUrl(page - 1)}" class="cms-page-link">← Previous</a>`);
  } else {
    items.push(`<span class="cms-page-link cms-page-disabled">← Previous</span>`);
  }

  // Page numbers (simplified: show first, current-1, current, current+1, last)
  const pages = new Set<number>();
  pages.add(1);
  if (page > 1) pages.add(page - 1);
  pages.add(page);
  if (page < totalPages) pages.add(page + 1);
  pages.add(totalPages);

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  let lastPage = 0;

  for (const p of sortedPages) {
    if (p - lastPage > 1) {
      items.push(`<span class="cms-page-ellipsis">…</span>`);
    }
    if (p === page) {
      items.push(`<span class="cms-page-link cms-page-current">${p}</span>`);
    } else {
      items.push(html`<a href="${pageUrl(p)}" class="cms-page-link">${String(p)}</a>`);
    }
    lastPage = p;
  }

  // Next button
  if (page < totalPages) {
    items.push(html`<a href="${pageUrl(page + 1)}" class="cms-page-link">Next →</a>`);
  } else {
    items.push(`<span class="cms-page-link cms-page-disabled">Next →</span>`);
  }

  return `<nav class="cms-pagination" aria-label="Pagination">
  ${items.join('\n  ')}
</nav>`;
}

/**
 * Pagination styles (add to defaultStyles if using pagination)
 */
export const paginationStyles = `
  .cms-pagination {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    margin-top: 1rem;
  }
  .cms-page-link {
    padding: 0.5rem 0.75rem;
    border-radius: var(--cms-radius);
    text-decoration: none;
    color: var(--cms-gray-700);
    background: white;
    border: 1px solid var(--cms-gray-200);
  }
  .cms-page-link:hover:not(.cms-page-disabled):not(.cms-page-current) {
    background: var(--cms-gray-100);
  }
  .cms-page-current {
    background: var(--cms-primary);
    color: white;
    border-color: var(--cms-primary);
  }
  .cms-page-disabled {
    color: var(--cms-gray-400);
    cursor: not-allowed;
  }
  .cms-page-ellipsis {
    padding: 0.5rem;
    color: var(--cms-gray-500);
  }
`;
