// @drizzle-cms/core
// Schema introspection, field mapping, and validation for Drizzle ORM

// ─────────────────────────────────────────────────────────────
// Types - Core data structures for introspected schema metadata
// ─────────────────────────────────────────────────────────────
export type {
  IntrospectedColumn,
  IntrospectedTable,
  IntrospectedRelation,
  IntrospectedSchema,
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
  introspectTable,
  introspectSchema,
  introspectRelations,
  introspectFullSchema,
  detectJunctionTables,
} from './schema/introspect.ts';

// ─────────────────────────────────────────────────────────────
// Field Mapping - Convert columns to UI field definitions
// Maps database types to CMS field types (text, number, relation, etc.)
// ─────────────────────────────────────────────────────────────
export type { CMSFieldType, CMSField } from './fields/mapping.ts';
export {
  mapColumnToFieldType,
  mapColumnToField,
  mapColumnsToFields,
  propertyNameToLabel,
} from './fields/mapping.ts';

// ─────────────────────────────────────────────────────────────
// Validation - Zod schema generation (re-exported from drizzle-zod)
// Use for form validation in handlers
// ─────────────────────────────────────────────────────────────
export { createInsertSchema, createSelectSchema } from './validation/zod.ts';
