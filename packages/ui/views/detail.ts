// Detail view - single record display

import {
  attrs,
  escapeHtml,
  formatFileSize,
  getSafeUrl,
  html,
  raw,
} from '../html.ts';
import type { CMSField } from '@hotsauce/core';
import { isValidFileReference } from '@hotsauce/core';
import type { RelationOption } from '../forms/inputs.ts';
import type { ManyToManyDisplayData } from './list.ts';
import type { FieldUIOverride } from '../forms/form.ts';

// Re-export FieldUIOverride for convenience
export type { FieldUIOverride } from '../forms/form.ts';

/**
 * Options for detail view
 */
export interface DetailViewOptions {
  /** Base URL for actions (e.g., /admin/posts) */
  baseUrl: string;
  /** Record ID */
  id: string | number;
  /** Show edit button */
  showEdit?: boolean;
  /** Show delete button */
  showDelete?: boolean;
  /** Show back button */
  showBack?: boolean;
  /** CSRF token for delete form */
  csrfToken?: string;
  /** Frontend URL for "View on site" link (null = hide link) */
  frontendUrl?: string | null;
  /** Additional CSS classes */
  class?: string;
}

/**
 * Format a value for display
 */
function formatValue(
  value: unknown,
  field: CMSField,
  relationOptions?: RelationOption[],
  fileUrl?: string,
): string {
  if (value === null || value === undefined) {
    return '<span class="cms-null">—</span>';
  }

  // For relation fields, show ID and display label in brackets
  if (field.fieldType === 'relation' && relationOptions) {
    const option = relationOptions.find((o) =>
      String(o.value) === String(value)
    );
    if (option) {
      return escapeHtml(`${String(value)} (${option.label})`);
    }
  }

  // For file fields, show file info with optional link
  if (field.fieldType === 'file' && isValidFileReference(value)) {
    const sizeStr = formatFileSize(value.size);
    const isImage = value.contentType.startsWith('image/');
    const isSvg = value.contentType === 'image/svg+xml';
    const fileConfig = field.column.cmsOptions?.file;
    const previewSvg = fileConfig && typeof fileConfig === 'object' &&
      fileConfig.previewSvg === true;
    const shouldRenderImagePreview = isImage && (!isSvg || previewSvg);
    const safeValueUrl = value.url ? getSafeUrl(value.url) : null;
    // Determine image source: fileUrl (served endpoint), url (external), or data (base64)
    const imgSrc = fileUrl ?? safeValueUrl ??
      (value.data ? `data:${value.contentType};base64,${value.data}` : null);
    const downloadUrl = fileUrl ?? safeValueUrl;
    const link = downloadUrl
      ? `<a href="${
        escapeHtml(downloadUrl)
      }" target="_blank" rel="noopener" class="cms-file-link">Download</a>`
      : '';
    // Show image preview for image files
    const imagePreview = shouldRenderImagePreview && imgSrc
      ? `<img src="${escapeHtml(imgSrc)}" alt="${
        escapeHtml(value.filename)
      }" class="cms-file-preview" />`
      : '';
    return `
      <div class="cms-file-display">
        ${imagePreview}
        <div class="cms-file-info">
          <span class="cms-file-icon">${isImage ? '🖼️' : '📄'}</span>
          <span class="cms-file-name">${escapeHtml(value.filename)}</span>
          <span class="cms-file-meta">(${
      escapeHtml(value.contentType)
    }, ${sizeStr})</span>
          ${link}
        </div>
      </div>
    `;
  }

  if (value instanceof Date) {
    return field.fieldType === 'date'
      ? value.toLocaleDateString()
      : value.toLocaleString();
  }

  if (typeof value === 'boolean') {
    return value
      ? '<span class="cms-bool cms-bool-true">Yes</span>'
      : '<span class="cms-bool cms-bool-false">No</span>';
  }

  if (typeof value === 'object') {
    return `<pre class="cms-json">${
      escapeHtml(JSON.stringify(value, null, 2))
    }</pre>`;
  }

  if (field.fieldType === 'textarea' || field.fieldType === 'richtext') {
    // Preserve line breaks
    return `<div class="cms-text">${
      escapeHtml(String(value)).replace(/\n/g, '<br>')
    }</div>`;
  }

  return escapeHtml(String(value));
}

/**
 * Render a field row in detail view
 */
export function detailField(
  field: CMSField,
  value: unknown,
  relationOptions?: RelationOption[],
  fileUrl?: string,
  override?: FieldUIOverride,
): string {
  if (field.hidden) {
    return '';
  }

  // Sanitize plugin-provided URL at the public API boundary
  const safeFileUrl = fileUrl ? getSafeUrl(fileUrl) ?? undefined : undefined;

  // Plugin-provided override: prefer human-readable summary over raw value
  // (e.g., "7 blocks" instead of a JSON dump), and surface an optional link
  // (e.g., "Edit with Puck \u2197\"") so users can jump into the plugin editor.
  const summaryHtml = override?.valueSummary
    ? `<p class="cms-value-summary">${escapeHtml(override.valueSummary)}</p>`
    : formatValue(value, field, relationOptions, safeFileUrl);

  const linkHref = override?.link?.href
    ? getSafeUrl(override.link.href) ?? undefined
    : undefined;

  const linkHtml = override?.link && linkHref
    ? html`
      <div class="cms-field-override">
        <a ${attrs({
          href: linkHref,
          target: override.link.target ?? '_self',
          class: 'cms-btn cms-btn-secondary',
          rel: override.link.target === '_blank' ? 'noopener' : undefined,
        })}>${override.link.label}${raw(
          override.link.target === '_blank' ? ' \u2197' : '',
        )}</a>
      </div>
    `
    : '';

  return html`
    <div class="cms-detail-field">
      <dt class="cms-detail-label">${field.label}</dt>
      <dd class="cms-detail-value">${raw(summaryHtml)}${raw(linkHtml)}</dd>
    </div>
  `;
}

/**
 * Render a detail view for a record
 */
export function detailView(
  title: string,
  fields: CMSField[],
  record: Record<string, unknown>,
  options: DetailViewOptions,
  relationData: Record<string, RelationOption[]> = {},
  manyToManyData: ManyToManyDisplayData[] = [],
  fieldOverrides: Record<string, FieldUIOverride> = {},
): string {
  const fieldRows = fields
    .filter((f) => !f.hidden)
    .map((f) => {
      // Use fileUrl from plugin override if available
      const override = fieldOverrides[f.column.propertyName];
      const fileUrl = override?.fileUrl;
      return detailField(
        f,
        record[f.column.propertyName],
        relationData[f.column.propertyName],
        fileUrl,
        override,
      );
    })
    .join('\n  ');

  // Render M2M fields
  const m2mRows = manyToManyData.map((m2m) => {
    const display = m2m.displayValues.length > 0
      ? escapeHtml(m2m.displayValues.join(', '))
      : '<span class="cms-null">—</span>';
    return html`
      <div class="cms-detail-field">
        <dt class="cms-detail-label">${m2m.label}</dt>
        <dd class="cms-detail-value">${raw(display)}</dd>
      </div>
    `;
  }).join('\n  ');

  const actions: string[] = [];

  // Frontend "View on site" link (external)
  if (options.frontendUrl) {
    actions.push(html`
      <a
        href="${options
          .frontendUrl}"
        target="_blank"
        rel="noopener"
        class="cms-btn cms-btn-secondary"
      >View on site ↗</a>
    `);
  }

  if (options.showEdit) {
    actions.push(html`
      <a href="${options.baseUrl}/${options
        .id}/edit" class="cms-btn cms-btn-primary">Edit</a>
    `);
  }

  if (options.showDelete) {
    const csrfField = options.csrfToken
      ? `<input type="hidden" name="_csrf" value="${
        escapeHtml(options.csrfToken)
      }" />`
      : '';
    actions.push(html`
      <form
        action="${options.baseUrl}/${options.id}/delete"
        method="POST"
        class="cms-inline-form"
      >
        ${raw(csrfField)}
        <button
          type="submit"
          class="cms-btn cms-btn-danger"
          data-confirm="Delete this record?"
        >
          Delete
        </button>
      </form>
    `);
  }

  if (options.showBack) {
    actions.push(html`
      <a href="${options
        .baseUrl}" class="cms-btn cms-btn-secondary">Back to List</a>
    `);
  }

  return html`
    <div ${attrs({ class: `cms-detail-view ${options.class ?? ''}`.trim() })}>
      <header class="cms-detail-header">
        <h1>${title}</h1>
        <div class="cms-detail-actions">
          ${raw(actions.join('\n      '))}
        </div>
      </header>
      <dl class="cms-detail-list">
        ${raw(fieldRows)} ${raw(m2mRows)}
      </dl>
    </div>
  `;
}
