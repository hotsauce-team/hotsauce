// @drizzle-cms/core
// Schema introspection, field mapping, and validation for Drizzle ORM

// ─────────────────────────────────────────────────────────────
// Types - Core data structures for introspected schema metadata
// ─────────────────────────────────────────────────────────────
export type {
  IntrospectedColumn,
  IntrospectedRelation,
  IntrospectedSchema,
  IntrospectedTable,
  JunctionTable,
  ManyToManyRelation,
  RelationType,
} from './schema/types.ts';

// Re-export Drizzle's Table type for convenience
export { Table } from './schema/types.ts';

// ─────────────────────────────────────────────────────────────
// Schema Introspection - Extract metadata from Drizzle tables
// Works with any dialect: Postgres, MySQL, SQLite
// ─────────────────────────────────────────────────────────────
export {
  detectJunctionTables,
  introspectFullSchema,
  introspectRelations,
  introspectSchema,
  introspectTable,
} from './schema/introspect.ts';

// ─────────────────────────────────────────────────────────────
// Field Mapping - Convert columns to UI field definitions
// Maps database types to CMS field types (text, number, relation, etc.)
// ─────────────────────────────────────────────────────────────
export type { CMSField, CMSFieldType } from './fields/mapping.ts';
export {
  mapColumnsToFields,
  mapColumnToField,
  mapColumnToFieldType,
  propertyNameToLabel,
} from './fields/mapping.ts';

// ─────────────────────────────────────────────────────────────
// Validation - Zod schema generation (re-exported from drizzle-zod)
// Use for form validation in handlers
// ─────────────────────────────────────────────────────────────
export {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from './validation/zod.ts';

// ─────────────────────────────────────────────────────────────
// CMS Extension Types - Column and table metadata via $cms()
// ─────────────────────────────────────────────────────────────
export type {
  CmsColumnOptions,
  CmsTableOptions,
  FileReference,
  FrontendUrlFn,
} from './extend/types.ts';
export {
  CMS_TABLE_OPTIONS,
  FILE_DEFAULT_ACCEPT,
  FILE_DEFAULT_MAX_SIZE,
  isValidFileReference,
} from './extend/types.ts';
