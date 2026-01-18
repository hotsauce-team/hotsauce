// Form field wrapper component

import { html, attrs, raw } from '../html.ts';
import { renderFieldInput, type FieldInputOptions, type RelationOption } from './inputs.ts';
import type { CMSField } from '@drizzle-cms/core';

// Re-export for convenience
export type { RelationOption } from './inputs.ts';

/**
 * Options for rendering a form field
 */
export interface FormFieldOptions extends FieldInputOptions {
  /** Error message to display */
  error?: string;
  /** Help text override */
  helpText?: string;
}

/**
 * Render a complete form field with label, input, and error/help text
 */
export function formField(field: CMSField, options: FormFieldOptions = {}): string {
  // Skip hidden fields (render just the input)
  if (field.hidden) {
    return renderFieldInput(field, options);
  }

  const id = options.id ?? field.column.propertyName;
  const hasError = Boolean(options.error);
  const helpText = options.helpText ?? field.helpText;
  const isRequired = field.column.notNull && !field.column.hasDefault;

  return html`<div ${attrs({
    class: `cms-field ${hasError ? 'cms-field-error' : ''} ${field.readOnly ? 'cms-field-readonly' : ''}`.trim(),
  })}>
  <label ${attrs({ for: id, class: 'cms-label' })}>
    ${field.label}${raw(isRequired ? '<span class="cms-required">*</span>' : '')}
  </label>
  ${raw(renderFieldInput(field, { ...options, id }))}
  ${raw(hasError ? html`<p class="cms-error">${options.error}</p>` : '')}
  ${raw(helpText ? html`<p class="cms-help">${helpText}</p>` : '')}
</div>`;
}

/**
 * Render multiple form fields
 */
export function formFields(
  fields: CMSField[],
  values: Record<string, unknown> = {},
  errors: Record<string, string> = {},
  relationData: Record<string, RelationOption[]> = {}
): string {
  return fields
    .map(field => formField(field, {
      value: values[field.column.propertyName],
      error: errors[field.column.propertyName],
      relationOptions: relationData[field.column.propertyName],
    }))
    .join('\n');
}
