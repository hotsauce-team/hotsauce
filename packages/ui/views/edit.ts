// Edit view - form for creating/editing records

import { attrs, html, raw } from '../html.ts';
import {
  type FieldUIOverride,
  form,
  type RelationOption,
} from '../forms/form.ts';
import { checkboxListInput, type ManyToManyData } from '../forms/inputs.ts';
import type { CMSField } from '@hotsauce/core';

// Re-export FieldUIOverride for convenience
export type { FieldUIOverride } from '../forms/form.ts';

/**
 * Options for edit view
 */
export interface EditViewOptions {
  /** Base URL for navigation (e.g., /admin/posts) */
  baseUrl: string;
  /** Record ID (undefined for create) */
  id?: string | number;
  /** Form submit URL override */
  action?: string;
  /** CSRF token to embed in form */
  csrfToken?: string;
  /** Source token to identify form origin (cms vs plugin) */
  sourceToken?: string;
  /** Enable multipart form data (for file uploads) */
  multipart?: boolean;
  /** Frontend URL for "View on site" link (null = hide link) */
  frontendUrl?: string | null;
  /** Additional CSS classes */
  class?: string;
  /** Context for file serving URLs (S3-stored files need this for preview) */
  fileContext?: {
    basePath: string;
    tableName: string;
    recordId: string | number;
  };
}

/**
 * Render many-to-many checkbox sections
 */
function renderManyToManySections(manyToManyData: ManyToManyData[]): string {
  if (manyToManyData.length === 0) return '';

  return manyToManyData.map((m2m) =>
    html`
      <div class="cms-field">
        <label class="cms-label">${m2m.label}</label>
        ${raw(checkboxListInput({
          name: m2m.fieldName,
          label: m2m.label,
          options: m2m.options,
          selectedValues: m2m.selectedValues,
        }))}
      </div>
    `
  ).join('\n');
}

/**
 * Render an edit/create view
 */
export function editView(
  title: string,
  fields: CMSField[],
  options: EditViewOptions,
  values: Record<string, unknown> = {},
  errors: Record<string, string> = {},
  relationData: Record<string, RelationOption[]> = {},
  manyToManyData: ManyToManyData[] = [],
  fieldOverrides: Record<string, FieldUIOverride> = {},
): string {
  const isEdit = options.id !== undefined;
  const action = options.action ??
    (isEdit ? `${options.baseUrl}/${options.id}` : options.baseUrl);
  const submitText = isEdit ? 'Update' : 'Create';

  const m2mSections = renderManyToManySections(manyToManyData);

  // Build header actions (only "View on site" for now)
  const headerActions: string[] = [];
  if (options.frontendUrl) {
    headerActions.push(html`
      <a
        href="${options
          .frontendUrl}"
        target="_blank"
        rel="noopener"
        class="cms-btn cms-btn-secondary"
      >View on site ↗</a>
    `);
  }
  const actionsHtml = headerActions.length > 0
    ? `<div class="cms-edit-actions">${headerActions.join('\n')}</div>`
    : '';

  return html`
    <div ${attrs({ class: `cms-edit-view ${options.class ?? ''}`.trim() })}>
      <header class="cms-edit-header">
        <h1>${title}</h1>
        ${raw(actionsHtml)}
      </header>
      ${raw(form(
        fields,
        {
          action,
          method: 'POST',
          submitText,
          cancelUrl: options.baseUrl,
          class: 'cms-edit-form',
          csrfToken: options.csrfToken,
          sourceToken: options.sourceToken,
          multipart: options.multipart,
          fileContext: options.fileContext,
        },
        values,
        errors,
        relationData,
        m2mSections,
        fieldOverrides,
      ))}
    </div>
  `;
}

/**
 * Render a create view (alias for editView without id)
 */
export function createView(
  title: string,
  fields: CMSField[],
  options: Omit<EditViewOptions, 'id'>,
  values: Record<string, unknown> = {},
  errors: Record<string, string> = {},
  relationData: Record<string, RelationOption[]> = {},
  manyToManyData: ManyToManyData[] = [],
  fieldOverrides: Record<string, FieldUIOverride> = {},
): string {
  return editView(
    title,
    fields,
    options,
    values,
    errors,
    relationData,
    manyToManyData,
    fieldOverrides,
  );
}
