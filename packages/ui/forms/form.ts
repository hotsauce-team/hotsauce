// Form wrapper component

import { html, attrs, raw } from '../html.ts';
import { formFields } from './field.ts';
import type { CMSField } from '@drizzle-cms/core';

/**
 * Options for rendering a form
 */
export interface FormOptions {
  /** Form action URL */
  action: string;
  /** HTTP method (default: POST) */
  method?: 'GET' | 'POST';
  /** Form ID */
  id?: string;
  /** Additional CSS classes */
  class?: string;
  /** Submit button text (default: Save) */
  submitText?: string;
  /** Cancel URL (if provided, shows cancel button) */
  cancelUrl?: string;
  /** Enable multipart form data (for file uploads) */
  multipart?: boolean;
}

/**
 * Render a complete form with fields and buttons
 */
export function form(
  fields: CMSField[],
  options: FormOptions,
  values: Record<string, unknown> = {},
  errors: Record<string, string> = {}
): string {
  const method = options.method ?? 'POST';
  const submitText = options.submitText ?? 'Save';

  return html`<form ${attrs({
    action: options.action,
    method,
    id: options.id,
    class: `cms-form ${options.class ?? ''}`.trim(),
    enctype: options.multipart ? 'multipart/form-data' : undefined,
  })}>
  ${raw(formFields(fields, values, errors))}
  
  <div class="cms-form-actions">
    <button type="submit" class="cms-btn cms-btn-primary">${submitText}</button>
    ${raw(options.cancelUrl 
      ? html`<a href="${options.cancelUrl}" class="cms-btn cms-btn-secondary">Cancel</a>` 
      : '')}
  </div>
</form>`;
}

/**
 * Render a delete confirmation form
 */
export function deleteForm(options: {
  action: string;
  confirmMessage?: string;
  buttonText?: string;
  class?: string;
}): string {
  const confirmMessage = options.confirmMessage ?? 'Are you sure you want to delete this record?';
  const buttonText = options.buttonText ?? 'Delete';

  return html`<form ${attrs({
    action: options.action,
    method: 'POST',
    class: `cms-form-delete ${options.class ?? ''}`.trim(),
    onsubmit: `return confirm('${confirmMessage}')`,
  })}>
  <input type="hidden" name="_method" value="DELETE" />
  <button type="submit" class="cms-btn cms-btn-danger">${buttonText}</button>
</form>`;
}
