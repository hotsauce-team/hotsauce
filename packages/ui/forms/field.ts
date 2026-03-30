// Form field wrapper component

import { attrs, getSafeUrl, html, raw } from '../html.ts';
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

  // Sanitize plugin-provided URL at the public API boundary
  const safeFileUrl = options.override?.fileUrl
    ? getSafeUrl(options.override.fileUrl)
    : null;

  // If there's a link override, render a link (and value display if read-only)
  if (options.override?.link) {
    const { label, href, target } = options.override.link;

    // For file fields, show image preview only if it's actually an image
    // SVG previews require explicit opt-in (previewSvg: true) due to XSS risk
    const fileValue = options.value as
      | { contentType?: string; filename?: string }
      | undefined;
    const isImage = fileValue?.contentType?.startsWith('image/') ?? false;
    const isSvg = fileValue?.contentType === 'image/svg+xml';
    const fileConfig = field.column.cmsOptions?.file;
    const previewSvg = fileConfig && typeof fileConfig === 'object' &&
      fileConfig.previewSvg === true;
    const shouldRenderImagePreview = isImage && (!isSvg || previewSvg);
    const altText = fileValue?.filename ?? `${field.label} preview`;
    const imagePreview = safeFileUrl && shouldRenderImagePreview
      ? html`
        <img src="${safeFileUrl}" alt="${altText}" class="cms-file-preview" />
      `
      : '';

    // For read-only fields, show summary (or value) and the link
    // This allows users to see what the current value is and access the plugin editor
    const valueSummary = options.override.valueSummary;
    if (field.readOnly) {
      return html`
        <div ${attrs({
          class: 'cms-field cms-field-readonly',
        })}>
          <label ${attrs({ for: id, class: 'cms-label' })}>
            ${field.label}
          </label>
          ${raw(imagePreview)} ${raw(
            valueSummary
              ? html`
                <p class="cms-value-summary">${valueSummary}</p>
              `
              : renderFieldInput(field, { ...options, id, disabled: true }),
          )}
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

    // Non-readonly fields: show preview + summary (if provided) + link (replaces raw input)
    return html`
      <div ${attrs({
        class: 'cms-field',
      })}>
        <label ${attrs({ class: 'cms-label' })}>
          ${field.label}
        </label>
        ${raw(imagePreview)} ${raw(
          valueSummary
            ? html`
              <p class="cms-value-summary">${valueSummary}</p>
            `
            : '',
        )}
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

  // valueSummary without link: show summary instead of input
  // Used for: read-only fields (hides raw JSON), or when plugin wants to replace input with a message
  // (e.g., S3 plugin on create: "Save record first to upload files via S3")
  if (options.override?.valueSummary && !options.override?.link) {
    return html`
      <div ${attrs({
        class: `cms-field ${field.readOnly ? 'cms-field-readonly' : ''}`.trim(),
      })}>
        <label ${attrs({ for: id, class: 'cms-label' })}>
          ${field.label}
        </label>
        <p class="cms-value-summary">${options.override.valueSummary}</p>
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
