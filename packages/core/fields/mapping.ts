// Field type mapping from Drizzle column types to CMS field types

import type { IntrospectedColumn } from '../schema/types.ts';

/**
 * CMS field types that map to UI components
 */
export type CMSFieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'relation'
  | 'file'
  | 'json'
  | 'uuid'
  | 'array';

/**
 * CMS field definition with UI hints
 */
export interface CMSField {
  /** Original column metadata */
  column: IntrospectedColumn;

  /** CMS field type for UI rendering */
  fieldType: CMSFieldType;

  /** Human-readable label (derived from property name) */
  label: string;

  /** Placeholder text for input */
  placeholder?: string;

  /** Help text for the field */
  helpText?: string;

  /** Whether this field should be hidden in forms */
  hidden?: boolean;

  /** Whether this field is read-only */
  readOnly?: boolean;

  /** Accepted MIME types for file fields (e.g., 'image/*', 'application/pdf') */
  fileAccept?: string;
}

/**
 * Convert property name to human-readable label
 * e.g., "authorId" -> "Author Id", "createdAt" -> "Created At"
 */
export function propertyNameToLabel(propertyName: string): string {
  return propertyName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Map a Drizzle column type to a CMS field type
 */
export function mapColumnToFieldType(column: IntrospectedColumn): CMSFieldType {
  // Check for array first
  if (column.isArray) {
    return 'array';
  }

  // Check for foreign key reference
  if (column.references) {
    return 'relation';
  }

  // Check for enum
  if (column.enumValues) {
    return 'select';
  }

  // Check for UUID first (before general string mapping)
  if (/uuid/i.test(column.columnType)) {
    return 'uuid';
  }

  // Primary mapping based on dataType (database-agnostic)
  const dataTypeMap: Record<string, CMSFieldType> = {
    string: 'text',
    number: 'number',
    boolean: 'boolean',
    date: 'datetime',
    json: 'json',
    bigint: 'number',
  };

  const fromDataType = dataTypeMap[column.dataType];
  if (fromDataType) {
    // Refine text fields - check if it's a long text type
    if (fromDataType === 'text') {
      // columnType patterns for long text (database-agnostic patterns)
      const longTextPatterns = /Text|Clob|MediumText|LongText/i;
      if (longTextPatterns.test(column.columnType)) {
        return 'textarea';
      }
    }

    // Refine date fields - check for date-only vs datetime
    if (fromDataType === 'datetime') {
      const dateOnlyPatterns = /^(Pg|MySQL|SQLite)?Date$/i;
      if (dateOnlyPatterns.test(column.columnType)) {
        return 'date';
      }
    }

    return fromDataType;
  }

  // Default to text
  return 'text';
}

/**
 * Map an introspected column to a CMS field definition
 */
export function mapColumnToField(column: IntrospectedColumn): CMSField {
  const fieldType = mapColumnToFieldType(column);
  const label = propertyNameToLabel(column.propertyName);

  const field: CMSField = {
    column,
    fieldType,
    label,
  };

  // Auto-hide primary keys and timestamps
  if (column.isPrimaryKey) {
    field.hidden = true;
    field.readOnly = true;
  }

  // Common timestamp fields should be read-only
  if (column.name === 'created_at' || column.name === 'updated_at') {
    field.readOnly = true;
  }

  // Add placeholder for text fields
  if (fieldType === 'text' && column.maxLength) {
    field.placeholder = `Max ${column.maxLength} characters`;
  }

  return field;
}

/**
 * Map all columns from an introspected table to CMS fields
 */
export function mapColumnsToFields(
  columns: IntrospectedColumn[]
): CMSField[] {
  return columns.map(mapColumnToField);
}
