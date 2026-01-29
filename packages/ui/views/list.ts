// List view - table of records

import { attrs, escapeHtml, html, raw } from '../html.ts';
import type { CMSField } from '@drizzle-cms/core';
import { isValidFileReference } from '@drizzle-cms/core';
import type { RelationOption } from '../forms/inputs.ts';

/**
 * Display data for many-to-many relations in list/detail views
 */
export interface ManyToManyDisplayData {
  /** Form field name key (e.g., 'categoriesIds') */
  fieldName: string;
  /** Display label (e.g., 'Categories') */
  label: string;
  /** The selected values as display labels (pre-resolved) */
  displayValues: string[];
}

/**
 * Column configuration for list view
 */
export interface ListColumn {
  /** Column key (property name for accessing record values) */
  key: string;
  /** Column name (database column name for policy checks) */
  name?: string;
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
function defaultFormat(
  value: unknown,
  relationOptions?: RelationOption[],
): string {
  if (value === null || value === undefined) {
    return '<span class="cms-null">—</span>';
  }

  // For relation fields, show ID and display label in brackets
  if (relationOptions) {
    const option = relationOptions.find((o) =>
      String(o.value) === String(value)
    );
    if (option) {
      return escapeHtml(`${String(value)} (${option.label})`);
    }
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }
  if (typeof value === 'object') {
    // Check if this is a file reference
    if (isValidFileReference(value)) {
      return `<span class="cms-file-badge" title="${
        escapeHtml(value.contentType)
      }">📄 ${escapeHtml(value.filename)}</span>`;
    }
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
  options: ListViewOptions,
  relationData: Record<string, RelationOption[]> = {},
  manyToManyData: Map<string | number, ManyToManyDisplayData[]> = new Map(),
): string {
  const primaryKey = options.primaryKey ?? 'id';
  const showActions = options.showEdit || options.showDelete ||
    options.showView;
  const emptyMessage = options.emptyMessage ?? 'No records found.';

  if (records.length === 0) {
    return html`
      <div class="cms-empty">
        <p>${emptyMessage}</p>
        <a href="${options
          .baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
      </div>
    `;
  }

  // Get M2M column labels from first record's M2M data (all records have same relations)
  const m2mLabels: string[] = [];
  if (manyToManyData.size > 0) {
    const firstM2M = manyToManyData.values().next().value as
      | ManyToManyDisplayData[]
      | undefined;
    if (firstM2M) {
      for (const m2m of firstM2M) {
        m2mLabels.push(m2m.label);
      }
    }
  }

  const headerCells = columns.map((col) =>
    html`
      <th class="cms-th">${col.label}</th>
    `
  ).join('\n      ');

  const m2mHeaderCells = m2mLabels.map((label) =>
    html`
      <th class="cms-th">${label}</th>
    `
  ).join('\n      ');

  const rows = records.map((record) => {
    const id = record[primaryKey];
    const cells = columns.map((col) => {
      const value = record[col.key];
      const formatted = col.format
        ? col.format(value)
        : defaultFormat(value, relationData[col.key]);
      return `<td class="cms-td">${formatted}</td>`;
    }).join('\n      ');

    // Render M2M cells for this record
    const recordM2M = manyToManyData.get(id as string | number) ?? [];
    const m2mCells = recordM2M.map((m2m) => {
      const display = m2m.displayValues.length > 0
        ? escapeHtml(m2m.displayValues.join(', '))
        : '<span class="cms-null">—</span>';
      return `<td class="cms-td">${display}</td>`;
    }).join('\n      ');

    const actions: string[] = [];
    if (options.showView) {
      actions.push(html`
        <a href="${options
          .baseUrl}/${id}" class="cms-action cms-action-view">View</a>
      `);
    }
    if (options.showEdit) {
      actions.push(html`
        <a href="${options
          .baseUrl}/${id}/edit" class="cms-action cms-action-edit"
        >Edit</a>
      `);
    }
    if (options.showDelete) {
      actions.push(html`
        <form
          action="${options.baseUrl}/${id}/delete"
          method="POST"
          class="cms-action-form"
          onsubmit="return confirm('Delete this record?')"
        >
          <button type="submit" class="cms-action cms-action-delete">Delete</button>
        </form>
      `);
    }

    const actionsCell = showActions
      ? `<td class="cms-td cms-actions">${actions.join(' ')}</td>`
      : '';

    return `<tr class="cms-tr">
      ${cells}
      ${m2mCells}
      ${actionsCell}
    </tr>`;
  }).join('\n    ');

  return html`
    <table ${attrs({ class: `cms-table ${options.class ?? ''}`.trim() })}>
      <thead>
        <tr>
          ${raw(headerCells)} ${raw(m2mHeaderCells)} ${raw(
            showActions ? '<th class="cms-th cms-th-actions">Actions</th>' : '',
          )}
        </tr>
      </thead>
      <tbody>
        ${raw(rows)}
      </tbody>
    </table>
  `;
}

/**
 * Create list columns from CMSFields
 */
export function fieldsToListColumns(
  fields: CMSField[],
  exclude: string[] = [],
): ListColumn[] {
  return fields
    .filter((f) => !f.hidden && !exclude.includes(f.column.propertyName))
    .map((f) => ({
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
  options: ListViewOptions,
  relationData: Record<string, RelationOption[]> = {},
  manyToManyData: Map<string | number, ManyToManyDisplayData[]> = new Map(),
): string {
  return html`
    <div class="cms-list-view">
      <header class="cms-list-header">
        <h1>${title}</h1>
        <a href="${options
          .baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
      </header>
      ${raw(listTable(columns, records, options, relationData, manyToManyData))}
    </div>
  `;
}
