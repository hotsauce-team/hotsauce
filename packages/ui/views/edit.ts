// Edit view - form for creating/editing records

import { html, attrs, raw } from '../html.ts';
import { form, type RelationOption } from '../forms/form.ts';
import type { CMSField } from '@drizzle-cms/core';

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
  /** Additional CSS classes */
  class?: string;
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
  relationData: Record<string, RelationOption[]> = {}
): string {
  const isEdit = options.id !== undefined;
  const action = options.action ?? (isEdit 
    ? `${options.baseUrl}/${options.id}` 
    : options.baseUrl);
  const submitText = isEdit ? 'Update' : 'Create';

  return html`<div ${attrs({ class: `cms-edit-view ${options.class ?? ''}`.trim() })}>
  <header class="cms-edit-header">
    <h1>${title}</h1>
  </header>
  ${raw(form(fields, {
    action,
    method: 'POST',
    submitText,
    cancelUrl: options.baseUrl,
    class: 'cms-edit-form',
  }, values, errors, relationData))}
</div>`;
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
  relationData: Record<string, RelationOption[]> = {}
): string {
  return editView(title, fields, options, values, errors, relationData);
}
