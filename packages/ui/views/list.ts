// List view - table of records

import { html, attrs, raw, escapeHtml } from '../html.ts';
import type { CMSField, IntrospectedTable } from '@drizzle-cms/core';

/**
 * Column configuration for list view
 */
export interface ListColumn {
  /** Column key (property name) */
  key: string;
  /** Display label */
  label: string;
  /** Format function for cell value */
  format?: (value: unknown) => string;
}

/**
 * Options for list view
 */
export interface ListViewOptions {
  /** Base URL for record links (e.g., /admin/posts) */
  baseUrl: string;
  /** Primary key field name (default: id) */
  primaryKey?: string;
  /** Show edit action */
  showEdit?: boolean;
  /** Show delete action */
  showDelete?: boolean;
  /** Show view action */
  showView?: boolean;
  /** Additional CSS classes */
  class?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/**
 * Default value formatter
 */
function defaultFormat(value: unknown): string {
  if (value === null || value === undefined) {
    return '<span class="cms-null">—</span>';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (typeof value === 'object') {
    return '<span class="cms-json">[JSON]</span>';
  }
  return escapeHtml(String(value));
}

/**
 * Render a data table for listing records
 */
export function listTable(
  columns: ListColumn[],
  records: Record<string, unknown>[],
  options: ListViewOptions
): string {
  const primaryKey = options.primaryKey ?? 'id';
  const showActions = options.showEdit || options.showDelete || options.showView;
  const emptyMessage = options.emptyMessage ?? 'No records found.';

  if (records.length === 0) {
    return html`<div class="cms-empty">
  <p>${emptyMessage}</p>
  <a href="${options.baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
</div>`;
  }

  const headerCells = columns.map(col => 
    html`<th class="cms-th">${col.label}</th>`
  ).join('\n      ');

  const rows = records.map(record => {
    const id = record[primaryKey];
    const cells = columns.map(col => {
      const value = record[col.key];
      const formatted = col.format ? col.format(value) : defaultFormat(value);
      return `<td class="cms-td">${formatted}</td>`;
    }).join('\n      ');

    const actions: string[] = [];
    if (options.showView) {
      actions.push(html`<a href="${options.baseUrl}/${id}" class="cms-action cms-action-view">View</a>`);
    }
    if (options.showEdit) {
      actions.push(html`<a href="${options.baseUrl}/${id}/edit" class="cms-action cms-action-edit">Edit</a>`);
    }
    if (options.showDelete) {
      actions.push(html`<form action="${options.baseUrl}/${id}/delete" method="POST" class="cms-action-form" onsubmit="return confirm('Delete this record?')">
          <button type="submit" class="cms-action cms-action-delete">Delete</button>
        </form>`);
    }

    const actionsCell = showActions 
      ? `<td class="cms-td cms-actions">${actions.join(' ')}</td>` 
      : '';

    return `<tr class="cms-tr">
      ${cells}
      ${actionsCell}
    </tr>`;
  }).join('\n    ');

  return html`<table ${attrs({ class: `cms-table ${options.class ?? ''}`.trim() })}>
  <thead>
    <tr>
      ${raw(headerCells)}
      ${raw(showActions ? '<th class="cms-th cms-th-actions">Actions</th>' : '')}
    </tr>
  </thead>
  <tbody>
    ${raw(rows)}
  </tbody>
</table>`;
}

/**
 * Create list columns from CMSFields
 */
export function fieldsToListColumns(fields: CMSField[], exclude: string[] = []): ListColumn[] {
  return fields
    .filter(f => !f.hidden && !exclude.includes(f.column.propertyName))
    .map(f => ({
      key: f.column.propertyName,
      label: f.label,
    }));
}

/**
 * Render a complete list view with header and table
 */
export function listView(
  title: string,
  columns: ListColumn[],
  records: Record<string, unknown>[],
  options: ListViewOptions
): string {
  return html`<div class="cms-list-view">
  <header class="cms-list-header">
    <h1>${title}</h1>
    <a href="${options.baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
  </header>
  ${raw(listTable(columns, records, options))}
</div>`;
}
