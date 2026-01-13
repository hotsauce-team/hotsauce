// CRUD helper functions
// Extracted from crud.ts to reduce file size and improve maintainability

import { eq, inArray, and } from 'drizzle-orm';
import type { IntrospectedTable, IntrospectedColumn, IntrospectedSchema, CMSField, JunctionTable } from '@drizzle-cms/core';
import { mapColumnToField, mapColumnToFieldType } from '@drizzle-cms/core';
import type { RelationOption, ManyToManyData } from '@drizzle-cms/ui';
import type { ManyToManyDisplayData } from '@drizzle-cms/ui';
import type { ResolvedCmsOptions } from './types.ts';
import { cmsUrl, formatTableName, formatColumnName } from './router.ts';
import type { NavItem, ListColumn } from '@drizzle-cms/ui';

// ============================================================================
// Navigation helpers
// ============================================================================

export function buildNavItems(
  schema: IntrospectedSchema,
  basePath: string,
  activeTable?: string,
): NavItem[] {
  // Filter out junction tables from navigation
  const visibleTables = schema.tables.filter(t => !t.isJunction);
  
  return [
    { href: cmsUrl(basePath), label: 'Dashboard', active: !activeTable },
    ...visibleTables.map(t => ({
      href: cmsUrl(basePath, t.name),
      label: formatTableName(t.name),
      active: t.name === activeTable,
    })),
  ];
}

// ============================================================================
// Record helpers
// ============================================================================

// deno-lint-ignore no-explicit-any
export async function findRecord(
  db: any,
  drizzleTable: unknown,
  tableInfo: IntrospectedTable,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  const pkColumn = getPrimaryKeyColumn(tableInfo);
  const pkField = (drizzleTable as Record<string, unknown>)[pkColumn.name];
  
  const results = await db
    .select()
    .from(drizzleTable)
    .where(eq(pkField as never, recordId as never))
    .limit(1);
  
  return (results as Record<string, unknown>[])[0] ?? null;
}

export function getPrimaryKeyColumn(table: IntrospectedTable): IntrospectedColumn {
  const pk = table.columns.find(c => c.isPrimaryKey);
  if (!pk) {
    throw new Error(`Table ${table.name} has no primary key`);
  }
  return pk;
}

export function getPrimaryKeyValue(table: IntrospectedTable, record: Record<string, unknown>): string {
  const pk = getPrimaryKeyColumn(table);
  return String(record[pk.name] ?? '');
}

export function getEditableColumns(table: IntrospectedTable): IntrospectedColumn[] {
  return table.columns.filter(c => {
    // Exclude auto-generated columns
    if (c.isPrimaryKey && c.hasDefault) return false;
    if (c.name === 'created_at' || c.name === 'updated_at') return false;
    return true;
  });
}

// ============================================================================
// Column/field helpers
// ============================================================================

export function getListColumns(table: IntrospectedTable): ListColumn[] {
  return table.columns
    .filter(c => {
      // Exclude large text fields from list
      const fieldType = mapColumnToFieldType(c);
      if (fieldType === 'textarea' || fieldType === 'json') return false;
      return true;
    })
    .slice(0, 6)
    .map(c => ({
      // Use propertyName for key to match relationData keys and record property access
      key: c.propertyName,
      label: formatColumnName(c.name),
    }));
}

export function tableToCmsFields(table: IntrospectedTable, editableOnly = false): CMSField[] {
  let columns = table.columns;
  if (editableOnly) {
    columns = getEditableColumns(table);
  }
  
  return columns.map(col => mapColumnToField(col));
}

export function recordToValues(formData: Record<string, string | string[]>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

// ============================================================================
// Relation helpers
// ============================================================================

/**
 * Get the best display column for a table (for relation labels)
 * Looks for common naming patterns: name, title, label, email, etc.
 */
export function getDisplayColumn(table: IntrospectedTable): IntrospectedColumn | null {
  const preferredNames = ['name', 'title', 'label', 'email', 'username', 'slug'];
  
  for (const name of preferredNames) {
    const col = table.columns.find(c => c.name === name);
    if (col && col.dataType === 'string') {
      return col;
    }
  }
  
  // Fall back to first non-PK string column
  const stringCol = table.columns.find(c => c.dataType === 'string' && !c.isPrimaryKey);
  if (stringCol) return stringCol;
  
  // Last resort: first non-PK column
  return table.columns.find(c => !c.isPrimaryKey) ?? null;
}

/**
 * Fetch all records from a related table for FK picker
 */
export async function fetchRelationOptions(
  options: ResolvedCmsOptions,
  tableName: string
): Promise<RelationOption[]> {
  const table = options.introspected.tables.find(t => t.name === tableName);
  if (!table) return [];
  
  const drizzleTable = table.table;
  const pkColumn = table.columns.find(c => c.isPrimaryKey);
  const displayColumn = getDisplayColumn(table);
  
  if (!pkColumn) return [];
  
  try {
    const records = await options.db.select().from(drizzleTable).limit(500);
    
    return (records as Record<string, unknown>[]).map(record => {
      const value = record[pkColumn.name];
      const label = displayColumn 
        ? String(record[displayColumn.name] ?? value)
        : String(value);
      
      return {
        value: value as string | number,
        label,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fetch relation options for all FK columns in a table
 */
export async function fetchAllRelationOptions(
  options: ResolvedCmsOptions,
  table: IntrospectedTable
): Promise<Record<string, RelationOption[]>> {
  const relationData: Record<string, RelationOption[]> = {};
  
  // Find all columns with foreign key references
  const fkColumns = table.columns.filter(c => c.references);
  
  // Fetch options for each FK column in parallel
  // Use propertyName as key since that's what forms use for field lookup
  await Promise.all(
    fkColumns.map(async (col) => {
      if (col.references) {
        relationData[col.propertyName] = await fetchRelationOptions(options, col.references.table);
      }
    })
  );
  
  return relationData;
}

// ============================================================================
// Many-to-many helpers
// ============================================================================

/**
 * Get junctions where this table is involved (either side)
 */
export function getJunctionsForTable(
  junctions: JunctionTable[],
  tableName: string
): { junction: JunctionTable; relatedTable: string; thisColumn: string; relatedColumn: string }[] {
  const result: { junction: JunctionTable; relatedTable: string; thisColumn: string; relatedColumn: string }[] = [];

  for (const junction of junctions) {
    if (junction.leftTable === tableName) {
      result.push({
        junction,
        relatedTable: junction.rightTable,
        thisColumn: junction.leftColumn,
        relatedColumn: junction.rightColumn,
      });
    } else if (junction.rightTable === tableName) {
      result.push({
        junction,
        relatedTable: junction.leftTable,
        thisColumn: junction.rightColumn,
        relatedColumn: junction.leftColumn,
      });
    }
  }

  return result;
}

/**
 * Fetch many-to-many data for a record being edited
 */
export async function fetchManyToManyData(
  options: ResolvedCmsOptions,
  table: IntrospectedTable,
  recordId: string | number | undefined
): Promise<ManyToManyData[]> {
  const junctions = getJunctionsForTable(options.introspected.junctions, table.name);
  if (junctions.length === 0) return [];

  const result: ManyToManyData[] = [];

  for (const { junction, relatedTable, thisColumn, relatedColumn } of junctions) {
    // Find the junction table
    const junctionTableInfo = options.introspected.tables.find(t => t.name === junction.tableName);
    if (!junctionTableInfo) continue;

    // Find the related table
    const relatedTableInfo = options.introspected.tables.find(t => t.name === relatedTable);
    if (!relatedTableInfo) continue;

    // Fetch all options from the related table
    const allOptions = await fetchRelationOptions(options, relatedTable);

    // Fetch current selections if we have a recordId (edit mode)
    let selectedValues: (string | number)[] = [];
    if (recordId !== undefined) {
      try {
        const junctionTable = junctionTableInfo.table;
        // Find the column that points to this table
        const junctionThisCol = junctionTableInfo.columns.find(c => c.propertyName === thisColumn);
        const junctionRelatedCol = junctionTableInfo.columns.find(c => c.propertyName === relatedColumn);

        if (junctionThisCol && junctionRelatedCol) {
          // deno-lint-ignore no-explicit-any
          const drizzleCol = (junctionTable as any)[thisColumn];
          if (drizzleCol) {
            const rows = await options.db
              .select()
              .from(junctionTable)
              .where(eq(drizzleCol, recordId));

            selectedValues = (rows as Record<string, unknown>[]).map(
              row => row[relatedColumn] as string | number
            );
          }
        }
      } catch {
        // Ignore errors fetching selections
      }
    }

    result.push({
      fieldName: `${relatedTable}Ids`,
      label: formatTableName(relatedTable),
      relatedTable,
      options: allOptions,
      selectedValues,
    });
  }

  return result;
}

/**
 * Fetch many-to-many display data for list/detail views
 * Returns a Map from record ID to array of display data
 */
export async function fetchManyToManyDisplayData(
  options: ResolvedCmsOptions,
  table: IntrospectedTable,
  recordIds: (string | number)[]
): Promise<Map<string | number, ManyToManyDisplayData[]>> {
  const result = new Map<string | number, ManyToManyDisplayData[]>();
  if (recordIds.length === 0) return result;
  
  // Initialize empty arrays for all records
  for (const id of recordIds) {
    result.set(id, []);
  }

  const junctions = getJunctionsForTable(options.introspected.junctions, table.name);
  if (junctions.length === 0) return result;

  for (const { junction, relatedTable, thisColumn, relatedColumn } of junctions) {
    // Find the junction table
    const junctionTableInfo = options.introspected.tables.find(t => t.name === junction.tableName);
    if (!junctionTableInfo) continue;

    // Find the related table
    const relatedTableInfo = options.introspected.tables.find(t => t.name === relatedTable);
    if (!relatedTableInfo) continue;

    // Fetch all options from the related table (for display labels)
    const allOptions = await fetchRelationOptions(options, relatedTable);
    const optionLabels = new Map(allOptions.map(o => [String(o.value), o.label]));

    // Fetch junction rows for all recordIds at once
    try {
      const junctionTable = junctionTableInfo.table;
      // deno-lint-ignore no-explicit-any
      const drizzleCol = (junctionTable as any)[thisColumn];
      if (drizzleCol) {
        const rows = await options.db
          .select()
          .from(junctionTable)
          .where(inArray(drizzleCol, recordIds as number[]));

        // Group by this table's ID
        const groupedByRecord = new Map<string | number, (string | number)[]>();
        for (const row of rows as Record<string, unknown>[]) {
          const recordId = row[thisColumn] as string | number;
          const relatedId = row[relatedColumn] as string | number;
          if (!groupedByRecord.has(recordId)) {
            groupedByRecord.set(recordId, []);
          }
          groupedByRecord.get(recordId)!.push(relatedId);
        }

        // Build display data for each record
        for (const id of recordIds) {
          const selectedIds = groupedByRecord.get(id) ?? [];
          const displayValues = selectedIds.map(relId => 
            optionLabels.get(String(relId)) ?? String(relId)
          );
          
          result.get(id)!.push({
            fieldName: `${relatedTable}Ids`,
            label: formatTableName(relatedTable),
            displayValues,
          });
        }
      }
    } catch {
      // Ignore errors - M2M columns won't show
    }
  }

  return result;
}

/**
 * Save many-to-many junction data after creating/updating a record
 */
export async function saveManyToManyData(
  options: ResolvedCmsOptions,
  table: IntrospectedTable,
  recordId: string | number,
  formData: Record<string, string | string[]>
): Promise<void> {
  const junctions = getJunctionsForTable(options.introspected.junctions, table.name);
  if (junctions.length === 0) return;

  for (const { junction, relatedTable, thisColumn, relatedColumn } of junctions) {
    // Get field name for this relation
    const fieldName = `${relatedTable}Ids`;
    const rawValues = formData[fieldName];
    
    // Parse selected values from form
    const selectedIds = new Set<string>();
    if (rawValues) {
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      for (const v of values) {
        if (v) selectedIds.add(v);
      }
    }

    // Find the junction table
    const junctionTableInfo = options.introspected.tables.find(t => t.name === junction.tableName);
    if (!junctionTableInfo) continue;

    const junctionTable = junctionTableInfo.table;
    // deno-lint-ignore no-explicit-any
    const drizzleThisCol = (junctionTable as any)[thisColumn];
    // deno-lint-ignore no-explicit-any
    const drizzleRelatedCol = (junctionTable as any)[relatedColumn];
    
    if (!drizzleThisCol || !drizzleRelatedCol) continue;

    try {
      // Get existing junction rows for this record
      const existingRows = await options.db
        .select()
        .from(junctionTable)
        .where(eq(drizzleThisCol, recordId));

      const existingIds = new Set(
        (existingRows as Record<string, unknown>[]).map(r => String(r[relatedColumn]))
      );

      // Calculate what to delete and insert
      const toDelete = [...existingIds].filter(id => !selectedIds.has(id));
      const toInsert = [...selectedIds].filter(id => !existingIds.has(id));

      // Delete removed relations
      if (toDelete.length > 0) {
        await options.db
          .delete(junctionTable)
          .where(and(
            eq(drizzleThisCol, recordId),
            inArray(drizzleRelatedCol, toDelete.map(id => parseInt(id, 10) || id))
          ));
      }

      // Insert new relations
      if (toInsert.length > 0) {
        const insertValues = toInsert.map(relatedId => ({
          [thisColumn]: recordId,
          [relatedColumn]: parseInt(relatedId, 10) || relatedId,
        }));
        await options.db.insert(junctionTable).values(insertValues);
      }
    } catch {
      // Log but don't fail the whole operation
    }
  }
}

// ============================================================================
// Error handling
// ============================================================================

/**
 * Database error codes for common constraint violations
 */
const FK_VIOLATION_PATTERNS = [
  '23503', // Postgres FK violation code
  'SQLITE_CONSTRAINT_FOREIGNKEY',
  'ER_ROW_IS_REFERENCED', // MySQL
];

const UNIQUE_VIOLATION_PATTERNS = [
  '23505', // Postgres unique violation
  'SQLITE_CONSTRAINT_UNIQUE',
  'ER_DUP_ENTRY', // MySQL
];

/**
 * Check if an error is a foreign key violation
 */
export function isForeignKeyViolation(error: unknown): boolean {
  const errorCode = (error as { code?: string })?.code;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const causedBy = (error as { cause?: { message?: string } })?.cause?.message ?? '';
  const fullMessage = `${errorMessage} ${causedBy}`.toLowerCase();
  
  if (errorCode && FK_VIOLATION_PATTERNS.includes(errorCode)) {
    return true;
  }
  
  return fullMessage.includes('foreign key constraint') ||
         fullMessage.includes('foreign key') ||
         fullMessage.includes('violates foreign key');
}

/**
 * Check if an error is a unique constraint violation
 */
export function isUniqueViolation(error: unknown): boolean {
  const errorCode = (error as { code?: string })?.code;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const causedBy = (error as { cause?: { message?: string } })?.cause?.message ?? '';
  const fullMessage = `${errorMessage} ${causedBy}`.toLowerCase();
  
  if (errorCode && UNIQUE_VIOLATION_PATTERNS.includes(errorCode)) {
    return true;
  }
  
  return fullMessage.includes('unique constraint') ||
         fullMessage.includes('duplicate key') ||
         fullMessage.includes('unique');
}

/**
 * Get a safe, user-friendly error message from a database error
 * Never exposes raw error details to the user
 */
export function getSafeErrorMessage(error: unknown, action: 'create' | 'update' | 'delete'): string {
  if (isForeignKeyViolation(error)) {
    if (action === 'delete') {
      return 'Cannot delete this record because it is referenced by other records. Remove those references first.';
    }
    return 'The selected reference does not exist. Please choose a valid option.';
  }
  
  if (isUniqueViolation(error)) {
    return 'A record with these values already exists. Please use different values.';
  }
  
  // Generic safe messages based on action
  switch (action) {
    case 'create':
      return 'Failed to create the record. Please check your input and try again.';
    case 'update':
      return 'Failed to update the record. Please check your input and try again.';
    case 'delete':
      return 'Failed to delete the record. Please try again.';
  }
}
