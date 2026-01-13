// @drizzle-cms/ui
// HTML generation, form rendering, and view components
// Zero dependencies - pure template literal functions

// ─────────────────────────────────────────────────────────────
// HTML Utilities - XSS-safe template literals and helpers
// ─────────────────────────────────────────────────────────────
export {
  html,
  raw,
  escapeHtml,
  attrs,
  when,
  join,
  SafeHtml,
} from './html.ts';

// ─────────────────────────────────────────────────────────────
// Form Inputs - Individual input renderers by field type
// ─────────────────────────────────────────────────────────────
export type {
  RelationOption,
  ManyToManyData,
  FieldInputOptions,
  ManyToManyInputOptions,
} from './forms/inputs.ts';

export {
  textInput,
  textareaInput,
  numberInput,
  booleanInput,
  dateInput,
  datetimeInput,
  selectInput,
  uuidInput,
  jsonInput,
  hiddenInput,
  relationInput,
  checkboxListInput,
  renderFieldInput,
} from './forms/inputs.ts';

// ─────────────────────────────────────────────────────────────
// Form Fields - Field wrappers with labels and errors
// ─────────────────────────────────────────────────────────────
export type { FormFieldOptions } from './forms/field.ts';
export { formField, formFields } from './forms/field.ts';

// ─────────────────────────────────────────────────────────────
// Forms - Complete form components
// ─────────────────────────────────────────────────────────────
export type { FormOptions } from './forms/form.ts';
export { form, deleteForm } from './forms/form.ts';

// ─────────────────────────────────────────────────────────────
// Views - Page templates for CRUD operations
// ─────────────────────────────────────────────────────────────
export type {
  ListColumn,
  ListViewOptions,
  ManyToManyDisplayData,
} from './views/list.ts';

export {
  listTable,
  listView,
  fieldsToListColumns,
} from './views/list.ts';

export type { DetailViewOptions } from './views/detail.ts';
export { detailField, detailView } from './views/detail.ts';

export type { EditViewOptions } from './views/edit.ts';
export { editView, createView } from './views/edit.ts';

// ─────────────────────────────────────────────────────────────
// Components - Layout, navigation, and UI elements
// ─────────────────────────────────────────────────────────────
export type { NavItem, LayoutOptions } from './components/layout.ts';
export { layout, nav, defaultStyles } from './components/layout.ts';

export type { AlertType } from './components/alert.ts';
export { alert, alertStyles } from './components/alert.ts';

export type { PaginationOptions } from './components/pagination.ts';
export { pagination, paginationStyles } from './components/pagination.ts';

// ─────────────────────────────────────────────────────────────
// Styles - CSS stylesheet for the CMS UI
// ─────────────────────────────────────────────────────────────
export { cmsStylesheet } from './styles.ts';
