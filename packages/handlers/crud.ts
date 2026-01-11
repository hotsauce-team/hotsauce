// CRUD route handlers

import { eq, asc, desc, sql, and, inArray } from 'drizzle-orm';
import type { IntrospectedTable, IntrospectedColumn, IntrospectedSchema, CMSField, JunctionTable } from '@drizzle-cms/core';
import { mapColumnToField, mapColumnToFieldType } from '@drizzle-cms/core';
import { layout, nav, alert, pagination } from '@drizzle-cms/ui';
import { listView } from '@drizzle-cms/ui';
import { detailView } from '@drizzle-cms/ui';
import { editView, createView } from '@drizzle-cms/ui';
import { html, raw } from '@drizzle-cms/ui';
import type { RelationOption, ManyToManyData } from '@drizzle-cms/ui';
import type { ManyToManyDisplayData } from '@drizzle-cms/ui';
import type { RouteContext, ResolvedCmsOptions } from './types.ts';
import { htmlResponse, redirect, redirectWithFlash, parseFlashFromUrl, notFound, parseFormData, coerceFormValues, getPagination, getSort } from './utils.ts';
import { cmsUrl, formatTableName, formatColumnName } from './router.ts';
import type { NavItem, ListColumn, ListViewOptions, DetailViewOptions, EditViewOptions } from '@drizzle-cms/ui';

/**
 * Render the dashboard page
 */
export function handleDashboard(ctx: RouteContext): Response {
  const { options } = ctx;
  const basePath = options.basePath;
  
  // Filter out junction tables from dashboard
  const visibleTables = options.introspected.tables.filter(t => !t.isJunction);
  
  const navItems: NavItem[] = [
    { href: cmsUrl(basePath), label: 'Dashboard', active: true },
    ...visibleTables.map(t => ({
      href: cmsUrl(basePath, t.name),
      label: formatTableName(t.name),
      active: false,
    })),
  ];
  
  const content = html`
    <h1>Dashboard</h1>
    <p>Welcome to the ${options.title} admin panel.</p>
    
    <h2>Tables</h2>
    <div class="cms-table-grid">
      ${raw(visibleTables.map(table => html`
        <a href="${cmsUrl(basePath, table.name)}" class="cms-table-card">
          <h3>${formatTableName(table.name)}</h3>
          <p>${table.columns.length} columns</p>
        </a>
      `).join(''))}
    </div>
    
    <style>
      .cms-table-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .cms-table-card {
        display: block;
        padding: 1rem;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        text-decoration: none;
        color: inherit;
      }
      .cms-table-card:hover {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      .cms-table-card h3 {
        margin: 0 0 0.5rem;
        color: #212529;
      }
      .cms-table-card p {
        margin: 0;
        color: #6c757d;
        font-size: 0.875rem;
      }
    </style>
  `;
  
  const page = layout(content, {
    title: 'Dashboard',
    siteName: options.title,
    nav: navItems,
  });
  
  return htmlResponse(page);
}

/**
 * Render the list view for a table
 */
export async function handleList(ctx: RouteContext): Promise<Response> {
  const { options, route, url } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  // Get pagination and sort
  const { page, limit, offset } = getPagination(url);
  const columnNames = table.columns.map(c => c.name);
  const sortInfo = getSort(url, columnNames);
  
  // Count total records
  const countResult = await options.db
    .select({ count: sql<number>`count(*)` })
    .from(drizzleTable);
  const totalRecords = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.ceil(totalRecords / limit);
  
  // Fetch records
  let query = options.db.select().from(drizzleTable);
  
  // Apply sorting
  if (sortInfo) {
    const col = (drizzleTable as Record<string, unknown>)[sortInfo.column];
    if (col) {
      query = query.orderBy(sortInfo.direction === 'desc' ? desc(col as never) : asc(col as never));
    }
  }
  
  // Apply pagination
  query = query.limit(limit).offset(offset);
  
  const records = await query as Record<string, unknown>[];
  
  // Generate navigation
  const navItems = buildNavItems(options.introspected, basePath, table.name);
  
  // Build columns for list
  const listColumns = getListColumns(table);
  
  // Fetch relation data for FK columns
  const relationData = await fetchAllRelationOptions(options, table);
  
  // Fetch M2M display data for all records
  const pkCol = getPrimaryKeyColumn(table);
  const recordIds = records.map(r => r[pkCol.propertyName] as string | number);
  const m2mDisplayData = await fetchManyToManyDisplayData(options, table, recordIds);
  
  // List view options
  const listOptions: ListViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    primaryKey: getPrimaryKeyColumn(table).name,
    showEdit: true,
    showDelete: true,
    showView: true,
  };
  
  // Build content
  let content = '';
  
  // Add flash message if present (from URL params or context)
  const flash = ctx.flash ?? parseFlashFromUrl(url);
  if (flash) {
    content += alert(flash.message, flash.type);
  }
  
  // Add list view
  content += listView(
    formatTableName(table.name),
    listColumns,
    records,
    listOptions,
    relationData,
    m2mDisplayData,
  );
  
  // Add pagination if needed
  if (totalPages > 1) {
    content += pagination({
      page,
      totalPages,
      baseUrl: cmsUrl(basePath, table.name),
    });
  }
  
  const pageHtml = layout(content, {
    title: formatTableName(table.name),
    siteName: options.title,
    nav: navItems,
  });
  
  return htmlResponse(pageHtml);
}

/**
 * Render the detail view for a single record
 */
export async function handleRead(ctx: RouteContext): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  const record = await findRecord(options.db, drizzleTable, table, recordId);
  if (!record) {
    return notFound(`Record not found`);
  }
  
  const navItems = buildNavItems(options.introspected, basePath, table.name);
  const cmsFields = tableToCmsFields(table);
  const relationData = await fetchAllRelationOptions(options, table);
  
  // Fetch M2M display data for this record - use actual ID from record, not URL string
  const pkCol = getPrimaryKeyColumn(table);
  const actualRecordId = record[pkCol.propertyName] as string | number;
  const m2mMap = await fetchManyToManyDisplayData(options, table, [actualRecordId]);
  const m2mDisplayData = m2mMap.get(actualRecordId) ?? [];
  
  const detailOptions: DetailViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    showEdit: true,
    showDelete: true,
    showBack: true,
  };
  
  const content = detailView(
    formatTableName(table.name),
    cmsFields,
    record,
    detailOptions,
    relationData,
    m2mDisplayData,
  );
  
  const page = layout(content, {
    title: `View ${formatTableName(table.name)}`,
    siteName: options.title,
    nav: navItems,
  });
  
  return htmlResponse(page);
}

/**
 * Render the create form or handle form submission
 */
export async function handleCreate(ctx: RouteContext): Promise<Response> {
  const { request, options, route } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  // Handle POST - create record
  if (request.method === 'POST') {
    const formData = await parseFormData(request);
    const editableColumns = getEditableColumns(table);
    const values = coerceFormValues(formData, editableColumns);
    
    try {
      const result = await options.db
        .insert(drizzleTable)
        .values(values)
        .returning();
      
      const newRecord = result[0] as Record<string, unknown>;
      const newId = getPrimaryKeyValue(table, newRecord);
      
      // Save many-to-many relations
      await saveManyToManyData(options, table, newId, formData);
      
      return redirect(cmsUrl(basePath, table.name, newId));
    } catch (error) {
      // Re-render form with error
      return await renderCreateForm(ctx, recordToValues(formData), String(error));
    }
  }
  
  // Handle GET - show form
  return await renderCreateForm(ctx);
}

/**
 * Render the edit form or handle form submission
 */
export async function handleUpdate(ctx: RouteContext): Promise<Response> {
  const { request, options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  const record = await findRecord(options.db, drizzleTable, table, recordId);
  if (!record) {
    return notFound(`Record not found`);
  }
  
  // Handle POST - update record
  if (request.method === 'POST') {
    const formData = await parseFormData(request);
    const editableColumns = getEditableColumns(table);
    const values = coerceFormValues(formData, editableColumns);
    
    try {
      const pkColumn = getPrimaryKeyColumn(table);
      const pkField = (drizzleTable as Record<string, unknown>)[pkColumn.name];
      
      await options.db
        .update(drizzleTable)
        .set(values)
        .where(eq(pkField as never, recordId as never));
      
      // Save many-to-many relations
      await saveManyToManyData(options, table, recordId, formData);
      
      return redirect(cmsUrl(basePath, table.name, recordId));
    } catch (error) {
      // Re-render form with error
      return await renderEditForm(ctx, recordToValues(formData), String(error));
    }
  }
  
  // Handle GET - show form
  return await renderEditForm(ctx, record);
}

/**
 * Handle record deletion
 */
export async function handleDelete(ctx: RouteContext): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  try {
    const pkColumn = getPrimaryKeyColumn(table);
    const pkField = (drizzleTable as Record<string, unknown>)[pkColumn.name];
    
    await options.db
      .delete(drizzleTable)
      .where(eq(pkField as never, recordId as never));
    
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_success');
  } catch (error) {
    // Check for foreign key constraint violation (expected case)
    const errorMessage = error instanceof Error ? error.message : String(error);
    const causedBy = (error as { cause?: { message?: string } })?.cause?.message ?? '';
    const fullMessage = `${errorMessage} ${causedBy}`;
    const errorCode = (error as { code?: string })?.code;
    const isFkViolation = 
      errorCode === '23503' || // Postgres FK violation code
      fullMessage.includes('foreign key constraint') ||
      fullMessage.includes('FOREIGN KEY') ||
      fullMessage.includes('violates foreign key') ||
      fullMessage.includes('_fkey');
    
    if (isFkViolation) {
      return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_fk_error');
    }
    
    // Log unexpected errors for debugging
    console.error('Delete failed:', error);
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_error');
  }
}

// ============================================================================
// Helper functions
// ============================================================================

async function renderCreateForm(
  ctx: RouteContext,
  values: Record<string, unknown> = {},
  error?: string,
): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);
  
  const cmsFields = tableToCmsFields(table, true); // editable only
  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, undefined);
  
  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    action: cmsUrl(basePath, table.name) + '/new',
  };
  
  const errors: Record<string, string> = error ? { _form: error } : {};
  
  let content = '';
  if (error) {
    content += alert(error, 'error');
  }
  content += createView(
    `Create ${formatTableName(table.name)}`,
    cmsFields,
    editOptions,
    values,
    errors,
    relationData,
    manyToManyData,
  );
  
  const page = layout(content, {
    title: `Create ${formatTableName(table.name)}`,
    siteName: options.title,
    nav: navItems,
  });
  
  return htmlResponse(page);
}

async function renderEditForm(
  ctx: RouteContext,
  values: Record<string, unknown>,
  error?: string,
): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);
  
  const cmsFields = tableToCmsFields(table, true); // editable only
  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, recordId);
  
  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
  };
  
  const errors: Record<string, string> = error ? { _form: error } : {};
  
  let content = '';
  if (error) {
    content += alert(error, 'error');
  }
  content += editView(
    `Edit ${formatTableName(table.name)}`,
    cmsFields,
    editOptions,
    values,
    errors,
    relationData,
    manyToManyData,
  );
  
  const page = layout(content, {
    title: `Edit ${formatTableName(table.name)}`,
    siteName: options.title,
    nav: navItems,
  });
  
  return htmlResponse(page);
}

function buildNavItems(
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

// deno-lint-ignore no-explicit-any
async function findRecord(
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

function getPrimaryKeyColumn(table: IntrospectedTable): IntrospectedColumn {
  const pk = table.columns.find(c => c.isPrimaryKey);
  if (!pk) {
    throw new Error(`Table ${table.name} has no primary key`);
  }
  return pk;
}

function getPrimaryKeyValue(table: IntrospectedTable, record: Record<string, unknown>): string {
  const pk = getPrimaryKeyColumn(table);
  return String(record[pk.name] ?? '');
}

function getEditableColumns(table: IntrospectedTable): IntrospectedColumn[] {
  return table.columns.filter(c => {
    // Exclude auto-generated columns
    if (c.isPrimaryKey && c.hasDefault) return false;
    if (c.name === 'created_at' || c.name === 'updated_at') return false;
    return true;
  });
}

function getListColumns(table: IntrospectedTable): ListColumn[] {
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

function tableToCmsFields(table: IntrospectedTable, editableOnly = false): CMSField[] {
  let columns = table.columns;
  if (editableOnly) {
    columns = getEditableColumns(table);
  }
  
  return columns.map(col => mapColumnToField(col));
}

function recordToValues(formData: Record<string, string | string[]>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(formData)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

/**
 * Get the best display column for a table (for relation labels)
 * Looks for common naming patterns: name, title, label, email, etc.
 */
function getDisplayColumn(table: IntrospectedTable): IntrospectedColumn | null {
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
async function fetchRelationOptions(
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
async function fetchAllRelationOptions(
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

/**
 * Get junctions where this table is involved (either side)
 */
function getJunctionsForTable(
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
async function fetchManyToManyData(
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
async function fetchManyToManyDisplayData(
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
async function saveManyToManyData(
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
