// @hotsauce/ui
// HTML generation, form rendering, and view components
// Zero dependencies - pure template literal functions

// ─────────────────────────────────────────────────────────────
// HTML Utilities - XSS-safe template literals and helpers
// ─────────────────────────────────────────────────────────────
export {
  attrs,
  escapeHtml,
  escapeUrlPath,
  getSafeUrl,
  html,
  join,
  raw,
  SafeHtml,
  when,
} from './html.ts';

// ─────────────────────────────────────────────────────────────
// Form Inputs - Individual input renderers by field type
// ─────────────────────────────────────────────────────────────
export type {
  FieldInputOptions,
  ManyToManyData,
  ManyToManyInputOptions,
  RelationOption,
} from './forms/inputs.ts';

export {
  booleanInput,
  checkboxListInput,
  dateInput,
  datetimeInput,
  fileInput,
  hiddenInput,
  jsonInput,
  numberInput,
  relationInput,
  renderFieldInput,
  selectInput,
  textareaInput,
  textInput,
  uuidInput,
} from './forms/inputs.ts';

// ─────────────────────────────────────────────────────────────
// Form Fields - Field wrappers with labels and errors
// ─────────────────────────────────────────────────────────────
export type { FieldUIOverride, FormFieldOptions } from './forms/field.ts';
export { formField, formFields } from './forms/field.ts';

// ─────────────────────────────────────────────────────────────
// Forms - Complete form components
// ─────────────────────────────────────────────────────────────
export type { FormOptions } from './forms/form.ts';
export { deleteForm, form } from './forms/form.ts';

// ─────────────────────────────────────────────────────────────
// Views - Page templates for CRUD operations
// ─────────────────────────────────────────────────────────────
export type {
  ListColumn,
  ListViewOptions,
  ManyToManyDisplayData,
} from './views/list.ts';

export { fieldsToListColumns, listTable, listView } from './views/list.ts';

export type { DetailViewOptions } from './views/detail.ts';
export { detailField, detailView } from './views/detail.ts';

export type { EditViewOptions } from './views/edit.ts';
export { createView, editView } from './views/edit.ts';

// ─────────────────────────────────────────────────────────────
// Components - Layout, navigation, and UI elements
// ─────────────────────────────────────────────────────────────
export type { LayoutOptions, NavItem } from './components/layout.ts';
export { defaultStyles, layout, nav } from './components/layout.ts';

export type { AlertType } from './components/alert.ts';
export { alert, alertStyles } from './components/alert.ts';

export type { PaginationOptions } from './components/pagination.ts';
export { pagination, paginationStyles } from './components/pagination.ts';

// ─────────────────────────────────────────────────────────────
// Styles - CSS stylesheet for the CMS UI
// ─────────────────────────────────────────────────────────────
export { cmsStylesheet } from './styles.ts';

// ─────────────────────────────────────────────────────────────
// Scripts - JavaScript for the CMS UI
// ─────────────────────────────────────────────────────────────
export { cmsScript } from './scripts.ts';
