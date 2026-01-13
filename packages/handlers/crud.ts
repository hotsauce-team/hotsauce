// CRUD route handlers

import { eq, asc, desc, sql } from 'drizzle-orm';
import type { CMSField } from '@drizzle-cms/core';
import { layout, alert, pagination } from '@drizzle-cms/ui';
import { listView } from '@drizzle-cms/ui';
import { detailView } from '@drizzle-cms/ui';
import { editView, createView } from '@drizzle-cms/ui';
import { html, raw } from '@drizzle-cms/ui';
import type { RouteContext } from './types.ts';
import { htmlResponse, redirect, redirectWithFlash, parseFlashFromUrl, notFound, parseFormData, coerceFormValues, getPagination, getSort } from './http.ts';
import { cmsUrl, formatTableName } from './router.ts';
import type { NavItem, ListViewOptions, DetailViewOptions, EditViewOptions } from '@drizzle-cms/ui';
import { generateCsrfToken, validateCsrfToken, getCsrfTokenFromFormData } from './csrf.ts';
import {
  buildNavItems,
  findRecord,
  getPrimaryKeyColumn,
  getPrimaryKeyValue,
  getEditableColumns,
  getListColumns,
  tableToCmsFields,
  recordToValues,
  fetchAllRelationOptions,
  fetchManyToManyData,
  fetchManyToManyDisplayData,
  saveManyToManyData,
  getSafeErrorMessage,
  isForeignKeyViolation,
} from './crud-helpers.ts';

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
  
  // Generate CSRF token for delete form
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  
  const detailOptions: DetailViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    showEdit: true,
    showDelete: true,
    showBack: true,
    csrfToken,
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
    
    // Validate CSRF token
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return await renderCreateForm(ctx, recordToValues(formData), 'Invalid or expired form. Please try again.');
    }
    
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
      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'create');
      return await renderCreateForm(ctx, recordToValues(formData), safeMessage);
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
    
    // Validate CSRF token
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return await renderEditForm(ctx, recordToValues(formData), 'Invalid or expired form. Please try again.');
    }
    
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
      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'update');
      return await renderEditForm(ctx, recordToValues(formData), safeMessage);
    }
  }
  
  // Handle GET - show form
  return await renderEditForm(ctx, record);
}

/**
 * Handle record deletion
 */
export async function handleDelete(ctx: RouteContext): Promise<Response> {
  const { request, options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  
  // For delete, also validate CSRF from form data
  if (request.method === 'POST') {
    const formData = await parseFormData(request);
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_error');
    }
  }
  
  try {
    const pkColumn = getPrimaryKeyColumn(table);
    const pkField = (drizzleTable as Record<string, unknown>)[pkColumn.name];
    
    await options.db
      .delete(drizzleTable)
      .where(eq(pkField as never, recordId as never));
    
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_success');
  } catch (error) {
    // Use helper to check for FK violation
    if (isForeignKeyViolation(error)) {
      return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_fk_error');
    }
    
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_error');
  }
}

// ============================================================================
// Form rendering helpers
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
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  
  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    action: cmsUrl(basePath, table.name) + '/new',
    csrfToken,
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
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  
  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    csrfToken,
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
