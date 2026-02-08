// Form field wrapper component

import { attrs, html, raw } from '../html.ts';
import {
  type FieldInputOptions,
  type RelationOption,
  renderFieldInput,
} from './inputs.ts';
import type { CMSField } from '@hotsauce/core';
import type { FieldUIOverride } from '@hotsauce/workers';

// Re-export for convenience
export type { RelationOption } from './inputs.ts';
export type { FieldUIOverride } from '@hotsauce/workers';

/**
 * Options for rendering a form field
 */
export interface FormFieldOptions extends FieldInputOptions {
  /** Error message to display */
  error?: string;
  /** Help text override */
  helpText?: string;
  /** UI override from plugin (replaces default input with link, etc.) */
  override?: FieldUIOverride;
}

/**
 * Render a complete form field with label, input, and error/help text
 */
export function formField(
  field: CMSField,
  options: FormFieldOptions = {},
): string {
  // Skip hidden fields (render just the input)
  if (field.hidden) {
    return renderFieldInput(field, options);
  }

  const id = options.id ?? field.column.propertyName;
  const hasError = Boolean(options.error);
  const helpText = options.helpText ?? field.helpText;
  const isRequired = field.column.notNull && !field.column.hasDefault;

  // If there's a link override, render a link instead of the input
  if (options.override?.link) {
    const { label, href, target } = options.override.link;
    return html`
      <div ${attrs({
        class: `cms-field ${field.readOnly ? 'cms-field-readonly' : ''}`.trim(),
      })}>
        <label ${attrs({ class: 'cms-label' })}>
          ${field.label}
        </label>
        <div class="cms-field-override">
          <a ${attrs({
            href,
            target: target ?? '_self',
            class: 'cms-btn cms-btn-secondary',
            rel: target === '_blank' ? 'noopener' : undefined,
          })}>${label}${raw(target === '_blank' ? ' ↗' : '')}</a>
        </div>
        ${raw(
          helpText
            ? html`
              <p class="cms-help">${helpText}</p>
            `
            : '',
        )}
      </div>
    `;
  }

  return html`
    <div ${attrs({
      class: `cms-field ${hasError ? 'cms-field-error' : ''} ${
        field.readOnly ? 'cms-field-readonly' : ''
      }`.trim(),
    })}>
      <label ${attrs({ for: id, class: 'cms-label' })}>
        ${field.label}${raw(
          isRequired ? '<span class="cms-required">*</span>' : '',
        )}
      </label>
      ${raw(renderFieldInput(field, { ...options, id }))} ${raw(
        hasError
          ? html`
            <p class="cms-error">${options.error}</p>
          `
          : '',
      )} ${raw(
        helpText
          ? html`
            <p class="cms-help">${helpText}</p>
          `
          : '',
      )}
    </div>
  `;
}

/**
 * Render multiple form fields
 */
export function formFields(
  fields: CMSField[],
  values: Record<string, unknown> = {},
  errors: Record<string, string> = {},
  relationData: Record<string, RelationOption[]> = {},
  fieldOverrides: Record<string, FieldUIOverride> = {},
): string {
  return fields
    .map((field) =>
      formField(field, {
        value: values[field.column.propertyName],
        error: errors[field.column.propertyName],
        relationOptions: relationData[field.column.propertyName],
        override: fieldOverrides[field.column.propertyName],
      })
    )
    .join('\n');
}
