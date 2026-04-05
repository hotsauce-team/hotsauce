// Grid view - thumbnail grid for tables with visual content

import { attrs, escapeHtml, getSafeUrl, html, raw } from '../html.ts';
import type { CMSField } from '@hotsauce/core';
import { isValidFileReference } from '@hotsauce/core';
import {
  type FieldUIOverride,
  form,
  type RelationOption,
} from '../forms/form.ts';
import type { ManyToManyData } from '../forms/inputs.ts';

/**
 * Options for grid view
 */
export interface GridViewOptions {
  /** Base URL for record links (e.g., /admin/media) */
  baseUrl: string;
  /** Primary key field name (default: id) */
  primaryKey?: string;
  /** The thumbnail field */
  thumbnailField: CMSField;
  /** Current view mode for toggle state */
  currentView: 'grid' | 'table';
  /** Current URL path + query for building toggle links */
  currentUrl: string;
  /** Currently selected record ID (for RHS panel) */
  selectedId?: string | number;
}

/**
 * Thumbnail data resolved for a record.
 * Pre-computed by the CMS handler so the UI doesn't need storage logic.
 */
export interface GridThumbnail {
  /** Record primary key */
  id: string | number;
  /** Resolved thumbnail URL (presigned, public, or data: URI) */
  thumbnailUrl: string | null;
  /** Display label (filename, alt text, or record identifier) */
  label: string;
}

/**
 * Data needed to render the RHS detail panel for a selected grid item.
 */
export interface GridPanelData {
  /** Record ID */
  id: string | number;
  /** Resolved thumbnail URL for larger preview */
  thumbnailUrl: string | null;
  /** File metadata (for file-type thumbnail columns) */
  fileMeta?: { filename: string; contentType: string; size: number };
  /** CMS fields to render in the edit form */
  fields: CMSField[];
  /** Current field values */
  values: Record<string, unknown>;
  /** Validation errors per field */
  errors: Record<string, string>;
  /** FK relation options for select dropdowns */
  relationData: Record<string, RelationOption[]>;
  /** Many-to-many data for checkbox lists */
  manyToManyData: ManyToManyData[];
  /** Plugin-provided field UI overrides */
  fieldOverrides: Record<string, FieldUIOverride>;
  /** CSRF token for form */
  csrfToken: string;
  /** Source token for form */
  sourceToken: string;
  /** Whether form needs multipart encoding */
  multipart?: boolean;
  /** URL to return to after save/delete (grid URL with ?selected removed) */
  returnUrl: string;
}

/**
 * Resolve a thumbnail URL from a record value based on field type.
 * For FileReference: uses fileUrl (presigned) → url → data: URI.
 * For plain strings: uses the value directly.
 */
export function resolveThumbnailUrl(
  value: unknown,
  fieldType: string,
  fileUrl?: string,
): string | null {
  if (fieldType === 'file') {
    if (!isValidFileReference(value)) return null;
    if (fileUrl) return fileUrl;
    const safeUrl = value.url ? getSafeUrl(value.url) : null;
    if (safeUrl) return safeUrl;
    if (value.data) {
      return `data:${value.contentType};base64,${value.data}`;
    }
    return null;
  }
  // Plain URL string
  if (typeof value === 'string' && value.length > 0) {
    return getSafeUrl(value);
  }
  return null;
}

/**
 * Get a display label for a grid item from the record.
 * Tries: alt text, filename from FileReference, or the record ID.
 */
export function getGridItemLabel(
  record: Record<string, unknown>,
  thumbnailField: CMSField,
  primaryKey: string,
): string {
  const value = record[thumbnailField.column.propertyName];

  // For file fields, use filename
  if (thumbnailField.fieldType === 'file' && isValidFileReference(value)) {
    return value.filename;
  }

  // Fall back to record ID
  const id = record[primaryKey];
  return id != null ? String(id) : '';
}

/**
 * Render the view toggle buttons (grid/table)
 */
export function viewToggle(
  currentView: 'grid' | 'table',
  currentUrl: string,
): string {
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
      })}>▦</a>
      <a ${attrs({
        href: tableUrl,
        class: `cms-view-toggle-btn${tableActive}`,
        title: 'Table view',
      })}>☰</a>
    </div>
  `;
}

/**
 * Render the thumbnail grid
 */
export function gridItems(
  records: Record<string, unknown>[],
  thumbnails: GridThumbnail[],
  options: GridViewOptions,
): string {
  const emptyMessage = 'No records found.';

  if (records.length === 0) {
    return html`
      <div class="cms-empty">
        <p>${emptyMessage}</p>
        <a href="${options
          .baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
      </div>
    `;
  }

  const items = thumbnails.map((thumb) => {
    const thumbnailHtml = thumb.thumbnailUrl
      ? `<img src="${escapeHtml(thumb.thumbnailUrl)}" alt="${
        escapeHtml(thumb.label)
      }" class="cms-grid-thumb" loading="lazy" />`
      : '<div class="cms-grid-placeholder">No image</div>';

    // Link to ?selected=<id> for panel, preserving existing params
    const selectUrl = new URL(options.currentUrl, 'http://localhost');
    selectUrl.searchParams.set('selected', String(thumb.id));
    const href = `${selectUrl.pathname}${selectUrl.search}`;

    const isSelected = options.selectedId !== undefined &&
      String(options.selectedId) === String(thumb.id);
    const selectedClass = isSelected ? ' cms-grid-item-selected' : '';

    return html`
      <a ${attrs({ href, class: `cms-grid-item${selectedClass}` })}>
        ${raw(thumbnailHtml)}
        <span class="cms-grid-label">${thumb.label}</span>
      </a>
    `;
  }).join('\n');

  return `<div class="cms-grid">${items}</div>`;
}

/**
 * Render the RHS detail/edit panel for a selected grid item.
 */
export function gridDetailPanel(
  panel: GridPanelData,
  options: GridViewOptions,
): string {
  // Close button: link back to grid without ?selected
  const closeUrl = new URL(options.currentUrl, 'http://localhost');
  closeUrl.searchParams.delete('selected');
  const closeHref = `${closeUrl.pathname}${closeUrl.search}`;

  // Thumbnail preview
  const previewHtml = panel.thumbnailUrl
    ? `<img src="${
      escapeHtml(panel.thumbnailUrl)
    }" alt="" class="cms-panel-preview" />`
    : '<div class="cms-panel-preview-placeholder">No image</div>';

  // File metadata
  let metaHtml = '';
  if (panel.fileMeta) {
    const sizeStr = formatFileSize(panel.fileMeta.size);
    metaHtml = html`
      <dl class="cms-panel-meta">
        <dt>Filename</dt>
        <dd>${panel.fileMeta.filename}</dd>
        <dt>Type</dt>
        <dd>${panel.fileMeta.contentType}</dd>
        <dt>Size</dt>
        <dd>${sizeStr}</dd>
      </dl>
    `;
  }

  // Edit form — reuses the standard form component
  const formAction = `${options.baseUrl}/${panel.id}`;
  const formHtml = form(
    panel.fields,
    {
      action: formAction,
      method: 'POST',
      submitText: 'Save',
      class: 'cms-panel-form',
      csrfToken: panel.csrfToken,
      sourceToken: panel.sourceToken,
      multipart: panel.multipart,
    },
    panel.values,
    panel.errors,
    panel.relationData,
    // Extra content: _return hidden field + M2M sections
    renderPanelExtraContent(panel),
    panel.fieldOverrides,
  );

  // Delete form
  const deleteAction = `${options.baseUrl}/${panel.id}/delete`;
  const csrfField = `<input type="hidden" name="_csrf" value="${
    escapeHtml(panel.csrfToken)
  }" />`;
  const returnField = `<input type="hidden" name="_return" value="${
    escapeHtml(panel.returnUrl)
  }" />`;

  return html`
    <aside class="cms-grid-panel">
      <div class="cms-panel-header">
        <a ${attrs({
          href: closeHref,
          class: 'cms-panel-close',
          title: 'Close panel',
        })}>✕</a>
      </div>
      ${raw(previewHtml)} ${raw(metaHtml)} ${raw(formHtml)}
      <div class="cms-panel-danger">
        <form action="${deleteAction}" method="POST" class="cms-inline-form">
          ${raw(csrfField)} ${raw(returnField)}
          <button
            type="submit"
            class="cms-btn cms-btn-danger"
            data-confirm="Delete this record?"
          >
            Delete
          </button>
        </form>
      </div>
    </aside>
  `;
}

/** Render extra hidden fields and M2M sections for the panel form */
function renderPanelExtraContent(panel: GridPanelData): string {
  const parts: string[] = [];
  // _return hidden field so update redirects back to grid
  parts.push(
    `<input type="hidden" name="_return" value="${
      escapeHtml(panel.returnUrl)
    }" />`,
  );
  return parts.join('\n');
}

/** Format file size in human-readable form */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Render a complete grid view with header, toggle, and grid
 */
export function gridView(
  title: string,
  records: Record<string, unknown>[],
  thumbnails: GridThumbnail[],
  options: GridViewOptions,
  panel?: GridPanelData,
): string {
  const toggle = viewToggle(options.currentView, options.currentUrl);
  const gridContent = gridItems(records, thumbnails, options);
  const panelHtml = panel ? gridDetailPanel(panel, options) : '';
  const layoutClass = panel ? ' cms-grid-panel-layout' : '';

  return html`
    <div class="cms-list-view">
      <header class="cms-list-header">
        <h1>${title}</h1>
        <div class="cms-list-actions">
          ${raw(toggle)}
          <a href="${options
            .baseUrl}/new" class="cms-btn cms-btn-primary">Create New</a>
        </div>
      </header>
      <div ${attrs({ class: `cms-grid-content${layoutClass}` })}>
        <div class="cms-grid-main">
          ${raw(gridContent)}
        </div>
        ${raw(panelHtml)}
      </div>
    </div>
  `;
}
