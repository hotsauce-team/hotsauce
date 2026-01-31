// CRUD route handlers

import { asc, desc, sql } from 'drizzle-orm';
import type { Table } from 'drizzle-orm';

import type { IntrospectedTable } from '@drizzle-cms/core';

import { alert, layout, pagination } from '@drizzle-cms/ui';
import { listView } from '@drizzle-cms/ui';
import { detailView } from '@drizzle-cms/ui';
import { createView, editView } from '@drizzle-cms/ui';
import { html, raw } from '@drizzle-cms/ui';
import type { RouteContext } from './types.ts';
import {
  coerceFormValues,
  getPagination,
  getSort,
  htmlResponse,
  notFound,
  parseFlashFromUrl,
  parseFormData,
  parseMultipartFormData,
  redirect,
  redirectWithFlash,
} from './http.ts';
import { cmsUrl, formatTableName } from './router.ts';
import type {
  DetailViewOptions,
  EditViewOptions,
  LayoutOptions,
  ListViewOptions,
  NavItem,
} from '@drizzle-cms/ui';
import {
  generateCsrfToken,
  getCsrfTokenFromFormData,
  validateCsrfToken,
} from './csrf.ts';
import {
  buildNavItems,
  fetchAllRelationOptions,
  fetchManyToManyData,
  fetchManyToManyDisplayData,
  getEditableColumns,
  getListColumns,
  getPrimaryKeyColumn,
  getPrimaryKeyValue,
  getSafeErrorMessage,
  isForeignKeyViolation,
  recordToValues,
  saveManyToManyData,
  tableToCmsFields,
  validateWithParsers,
} from './crud-helpers.ts';
import {
  applyPolicy,
  createPolicyContext,
  deleteWithPolicy,
  evaluateColumnPolicies,
  extractColumnPolicies,
  extractRowPolicy,
  filterRecordColumns,
  filterRecordsColumns,
  findRecordWithPolicy,
  injectColumnDefaults,
  recordExists,
  updateWithPolicy,
  validateHiddenRequiredColumns,
} from './policies/mod.ts';
import type { EvaluatedColumnPolicies } from './policies/mod.ts';

/**
 * Get plugin user context from RouteContext
 */
function getPluginUser(
  ctx: RouteContext,
): { sub: string; role?: string } | undefined {
  return ctx.authUser
    ? { sub: ctx.authUser.id, role: ctx.authUser.role }
    : undefined;
}

/**
 * Build common layout options for a page
 */
function buildLayoutOptions(
  ctx: RouteContext,
  title: string,
  navItems: NavItem[],
): LayoutOptions {
  const { options, authUser } = ctx;
  const basePath = options.basePath;

  return {
    title,
    siteName: options.title,
    nav: navItems,
    stylesheetUrl: `${basePath}/styles.css`,
    user: authUser
      ? {
        name: authUser.identity ?? `User ${authUser.id}`,
        logoutUrl: `${basePath}/logout`,
        accountUrl: `${basePath}/account`,
      }
      : undefined,
  };
}

function isAllowedFrontendHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0) return false;

  // Disallow control chars (can be used for obfuscation)
  if (/[^\u0020-\u007E\u00A0-\uFFFF]/.test(trimmed)) return false;

  // Disallow protocol-relative URLs ("//evil.com")
  if (trimmed.startsWith('//')) return false;

  // If it looks like it has a scheme, only allow http(s)
  const schemeMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[0].slice(0, -1).toLowerCase();
    return scheme === 'http' || scheme === 'https';
  }

  // Otherwise treat as relative ("/path", "path", "./path", "?q=1", "#hash", etc.)
  return true;
}

/**
 * Get frontend URL for a record using table's $cms({ frontendUrl }) config.
 * Returns null if no frontendUrl is configured or if the function returns null/undefined.
 */
function getFrontendUrl(
  ctx: Pick<RouteContext, 'options' | 'request' | 'url' | 'route'>,
  table: IntrospectedTable,
  record: Record<string, unknown>,
  action: 'read' | 'update',
): string | null {
  const frontendUrlFn = table.cmsOptions?.frontendUrl;
  if (!frontendUrlFn) return null;

  try {
    const url = frontendUrlFn(record);
    if (url === null || url === undefined) return null;

    // Defensive: user function might return non-string.
    if (typeof url !== 'string') {
      if (ctx.options.onError) {
        ctx.options.onError(
          new Error(
            `frontendUrl for table '${table.name}' returned a non-string (${typeof url})`,
          ),
          {
            request: ctx.request,
            url: ctx.url,
            route: ctx.route ?? null,
            table,
            action,
          },
        );
      }
      return null;
    }

    const trimmed = url.trim();
    if (!isAllowedFrontendHref(trimmed)) {
      if (ctx.options.onError) {
        ctx.options.onError(
          new Error(
            `frontendUrl for table '${table.name}' returned a disallowed URL`,
          ),
          {
            request: ctx.request,
            url: ctx.url,
            route: ctx.route ?? null,
            table,
            action,
          },
        );
      }
      return null;
    }

    return trimmed;
  } catch (error) {
    // User-provided function threw: report via onError but don't break the CMS.
    if (ctx.options.onError) {
      ctx.options.onError(
        error instanceof Error ? error : new Error(String(error)),
        {
          request: ctx.request,
          url: ctx.url,
          route: ctx.route ?? null,
          table,
          action,
        },
      );
    }
    return null;
  }
}

/**
 * Render the dashboard page
 */
export function handleDashboard(ctx: RouteContext): Response {
  const { options } = ctx;
  const basePath = options.basePath;

  // Filter out junction tables from dashboard
  const visibleTables = options.introspected.tables.filter((t) =>
    !t.isJunction
  );

  const navItems: NavItem[] = [
    { href: cmsUrl(basePath), label: 'Dashboard', active: true },
    ...visibleTables.map((t) => ({
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
      ${raw(
        visibleTables.map((table) =>
          html`
            <a href="${cmsUrl(basePath, table.name)}" class="cms-table-card">
              <h3>${formatTableName(table.name)}</h3>
              <p>${table.columns.length} columns</p>
            </a>
          `
        ).join(''),
      )}
    </div>
  `;

  const page = layout(content, buildLayoutOptions(ctx, 'Dashboard', navItems));

  return htmlResponse(page);
}

/**
 * Render the list view for a table
 */
export async function handleList(ctx: RouteContext): Promise<Response> {
  const { request, options, route, url, authUser } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const drizzleTable = table.table;

  // Apply row policy for list action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    return redirectWithFlash(cmsUrl(basePath), 'list_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'list');

  if (!policyResult.allowed) {
    return redirectWithFlash(cmsUrl(basePath), 'list_forbidden');
  }

  // Evaluate column policies to determine visible columns
  const columnPolicies = extractColumnPolicies(tablePolicy);
  const columnResult = await evaluateColumnPolicies(
    columnPolicies,
    table.columns,
    policyCtx,
  );

  // Get pagination and sort
  const { page, limit, offset } = getPagination(url);
  const columnNames = table.columns.map((c) => c.name);
  const sortInfo = getSort(url, columnNames);

  // Count total records (with policy filter)
  let countQuery = options.db
    .select({ count: sql<number>`count(*)` })
    .from(drizzleTable);

  if (policyResult.condition) {
    countQuery = countQuery.where(policyResult.condition);
  }

  const countResult = await countQuery;
  const totalRecords = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.ceil(totalRecords / limit);

  // Fetch records (with policy filter)
  let query = options.db.select().from(drizzleTable);

  // Apply policy condition
  if (policyResult.condition) {
    query = query.where(policyResult.condition);
  }

  // Apply sorting
  if (sortInfo) {
    const col = (drizzleTable as Record<string, unknown>)[sortInfo.column];
    if (col) {
      query = query.orderBy(
        sortInfo.direction === 'desc' ? desc(col as never) : asc(col as never),
      );
    }
  }

  // Apply pagination
  query = query.limit(limit).offset(offset);

  let records = await query as Record<string, unknown>[];

  // Filter records to only include readable columns (column-level security)
  // This ensures hidden columns never leave the handler layer
  records = filterRecordsColumns(
    records,
    columnResult.readableColumns,
    table.columns,
  );

  // Execute afterRead transform for each record
  if (ctx.pluginService) {
    records = await ctx.pluginService.afterReadMany(
      table.name,
      records,
      getPluginUser(ctx),
    );
  }

  // Execute list action hooks (fire-and-forget for audit logging etc.)
  if (ctx.pluginService) {
    ctx.pluginService.onAction(
      table.name,
      'list',
      undefined,
      getPluginUser(ctx),
    );
  }

  // Generate navigation
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Build columns for list, filtered by readable columns
  const listColumns = getListColumns(table).filter(
    (col) => columnResult.readableColumns.includes(col.name ?? col.key),
  );

  // Fetch relation data for FK columns
  const relationData = await fetchAllRelationOptions(options, table);

  // Fetch M2M display data for all records
  const pkCol = getPrimaryKeyColumn(table);
  const recordIds = records.map((r) =>
    r[pkCol.propertyName] as string | number
  );
  const m2mDisplayData = await fetchManyToManyDisplayData(
    options,
    table,
    recordIds,
  );

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

  const pageHtml = layout(
    content,
    buildLayoutOptions(ctx, formatTableName(table.name), navItems),
  );

  return htmlResponse(pageHtml);
}

/**
 * Render the detail view for a single record
 */
export async function handleRead(ctx: RouteContext): Promise<Response> {
  const { request, options, route, url, authUser } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;

  // Apply row policy for read action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'read_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'read');

  if (!policyResult.allowed) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'read_forbidden');
  }

  // Evaluate column policies to determine visible columns
  const columnPolicies = extractColumnPolicies(tablePolicy);
  const columnResult = await evaluateColumnPolicies(
    columnPolicies,
    table.columns,
    policyCtx,
  );

  // Fetch record with policy condition
  const record = await findRecordWithPolicy(
    options.db,
    drizzleTable as Table,
    table,
    recordId,
    policyResult.condition,
  );

  if (!record) {
    // Check if record exists at all (to distinguish 404 vs 403)
    const exists = await recordExists(
      options.db,
      drizzleTable as Table,
      table,
      recordId,
    );
    if (exists) {
      return redirectWithFlash(cmsUrl(basePath, table.name), 'read_forbidden');
    }
    return notFound(`Record not found`);
  }

  // Filter record to only include readable columns (column-level security)
  const filteredRecord = filterRecordColumns(
    record,
    columnResult.readableColumns,
    table.columns,
  );

  // Execute afterRead transform
  let transformedRecord = filteredRecord;
  if (ctx.pluginService) {
    transformedRecord = await ctx.pluginService.afterRead(
      table.name,
      'read',
      filteredRecord,
      getPluginUser(ctx),
    );
  }

  // Execute read action hooks
  const pkCol = getPrimaryKeyColumn(table);
  const actualRecordId = transformedRecord[pkCol.propertyName] as
    | string
    | number;
  if (ctx.pluginService) {
    ctx.pluginService.onAction(
      table.name,
      'read',
      actualRecordId,
      getPluginUser(ctx),
      undefined,
      transformedRecord,
    );
  }

  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Filter CMS fields to only include readable columns
  const cmsFields = tableToCmsFields(table).filter(
    (field) => columnResult.readableColumns.includes(field.column.name),
  );

  const relationData = await fetchAllRelationOptions(options, table);

  // Fetch M2M display data for this record - use actual ID from record, not URL string
  const m2mMap = await fetchManyToManyDisplayData(options, table, [
    actualRecordId,
  ]);
  const m2mDisplayData = m2mMap.get(actualRecordId) ?? [];

  // Generate CSRF token for delete form
  const csrfToken = await generateCsrfToken(options.csrfSecret);

  // Compute frontend URL from table's $cms() config
  const frontendUrl = getFrontendUrl(ctx, table, transformedRecord, 'read');

  const detailOptions: DetailViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    showEdit: true,
    showDelete: true,
    showBack: true,
    csrfToken,
    frontendUrl,
  };

  // Build content with optional flash message
  let content = '';

  // Add flash message if present (from URL params or context)
  const flash = ctx.flash ?? parseFlashFromUrl(url);
  if (flash) {
    content += alert(flash.message, flash.type);
  }

  content += detailView(
    formatTableName(table.name),
    cmsFields,
    transformedRecord,
    detailOptions,
    relationData,
    m2mDisplayData,
  );

  const page = layout(
    content,
    buildLayoutOptions(ctx, `View ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page);
}

/**
 * Render the create form or handle form submission
 */
export async function handleCreate(ctx: RouteContext): Promise<Response> {
  const { request, options, route, authUser } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const drizzleTable = table.table;

  // Apply row policy for create action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'create_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'create');

  // For create, policy can only allow or deny (no filtering)
  if (!policyResult.allowed) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'create_forbidden');
  }

  // Evaluate column policies to determine writable columns
  const columnPolicies = extractColumnPolicies(tablePolicy);
  const columnResult = await evaluateColumnPolicies(
    columnPolicies,
    table.columns,
    policyCtx,
  );

  // Validate that all required columns are writable or have defaults
  // This catches policy misconfigurations at runtime when we have user context
  const hiddenErrors = validateHiddenRequiredColumns(
    table.columns,
    columnResult,
  );
  if (hiddenErrors.length > 0) {
    // Configuration error - return 500 with clear message for debugging
    const errorMessages = hiddenErrors.map((e) => e.message).join(' ');
    return await renderCreateForm(
      ctx,
      columnResult,
      {},
      `Configuration error: ${errorMessages}`,
    );
  }

  // Handle POST - create record
  if (request.method === 'POST') {
    // Determine if we have file columns that need multipart parsing
    const fileColumns = table.columns.filter((col) => col.cmsOptions?.file);
    const hasFileColumns = fileColumns.length > 0;

    let formData: Record<string, string | string[]>;
    let fileData: Record<string, unknown> = {};
    let fileErrors: Record<string, string> = {};

    if (hasFileColumns) {
      // Use multipart parsing for tables with file columns
      const multipart = await parseMultipartFormData(request, fileColumns);
      formData = multipart.fields;
      fileData = multipart.files;
      fileErrors = multipart.errors;
    } else {
      // Standard form parsing
      formData = await parseFormData(request);
    }

    // Validate CSRF token
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return await renderCreateForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or expired form. Please try again.',
      );
    }

    // Check for file upload errors
    if (Object.keys(fileErrors).length > 0) {
      return await renderCreateForm(
        ctx,
        columnResult,
        { ...recordToValues(formData), ...fileData },
        undefined,
        fileErrors,
      );
    }

    // Only process columns the user can write to
    const editableColumns = getEditableColumns(table).filter(
      (col) => columnResult.writableColumns.includes(col.name),
    );
    let values = coerceFormValues(formData, editableColumns);

    // Merge in file data for file columns
    for (const [fieldName, fileRef] of Object.entries(fileData)) {
      if (
        columnResult.writableColumns.includes(
          table.columns.find((c) => c.propertyName === fieldName)?.name ?? '',
        )
      ) {
        values[fieldName] = fileRef;
      }
    }

    // Inject default values for non-writable columns
    values = injectColumnDefaults(values, columnResult.defaults);

    // Validate form data (uses custom parser if provided, else drizzle-zod)
    const validation = validateWithParsers(
      options,
      table.name,
      drizzleTable,
      values,
      'insert',
    );
    if (!validation.success) {
      return await renderCreateForm(
        ctx,
        columnResult,
        values,
        validation.formError,
        validation.errors,
      );
    }

    try {
      // Apply beforeSave transform if plugin service available
      let dataToInsert = validation.data ?? values;
      if (ctx.pluginService) {
        const pluginUser = getPluginUser(ctx);
        dataToInsert = await ctx.pluginService.beforeSave(
          table.name,
          'create',
          dataToInsert,
          pluginUser,
        );
      }

      const result = await options.db
        .insert(drizzleTable)
        .values(dataToInsert)
        .returning();

      const newRecord = result[0] as Record<string, unknown>;
      const newId = getPrimaryKeyValue(table, newRecord);

      // Save many-to-many relations
      await saveManyToManyData(options, table, newId, formData);

      // Fire create action hook (may be fire-and-forget)
      if (ctx.pluginService) {
        const pluginUser = getPluginUser(ctx);
        // Don't await - allow fire-and-forget plugins
        ctx.pluginService.onAction(
          table.name,
          'create',
          newId,
          pluginUser,
          undefined,
          newRecord,
        );
      }

      return redirect(cmsUrl(basePath, table.name, newId));
    } catch (error) {
      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'create');
      return await renderCreateForm(ctx, columnResult, values, safeMessage);
    }
  }

  // Handle GET - show form
  return await renderCreateForm(ctx, columnResult);
}

/**
 * Render the edit form or handle form submission
 */
export async function handleUpdate(ctx: RouteContext): Promise<Response> {
  const { request, options, route, authUser } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;

  // Apply row policy for update action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    return redirectWithFlash(
      cmsUrl(basePath, table.name, recordId),
      'update_forbidden',
    );
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'update');

  if (!policyResult.allowed) {
    return redirectWithFlash(
      cmsUrl(basePath, table.name, recordId),
      'update_forbidden',
    );
  }

  // Evaluate column policies to determine writable columns
  const columnPolicies = extractColumnPolicies(tablePolicy);
  const columnResult = await evaluateColumnPolicies(
    columnPolicies,
    table.columns,
    policyCtx,
  );

  // Fetch record with policy condition (for GET form display)
  const record = await findRecordWithPolicy(
    options.db,
    drizzleTable as Table,
    table,
    recordId,
    policyResult.condition,
  );

  if (!record) {
    // Check if record exists at all (to distinguish 404 vs 403)
    const exists = await recordExists(
      options.db,
      drizzleTable as Table,
      table,
      recordId,
    );
    if (exists) {
      return redirectWithFlash(
        cmsUrl(basePath, table.name),
        'update_forbidden',
      );
    }
    return notFound(`Record not found`);
  }

  // Handle POST - update record
  if (request.method === 'POST') {
    // Determine if we have file columns that need multipart parsing
    const fileColumns = table.columns.filter((col) => col.cmsOptions?.file);
    const hasFileColumns = fileColumns.length > 0;

    let formData: Record<string, string | string[]>;
    let fileData: Record<string, unknown> = {};
    let fileErrors: Record<string, string> = {};

    if (hasFileColumns) {
      // Use multipart parsing for tables with file columns
      const multipart = await parseMultipartFormData(request, fileColumns);
      formData = multipart.fields;
      fileData = multipart.files;
      fileErrors = multipart.errors;
    } else {
      // Standard form parsing
      formData = await parseFormData(request);
    }

    // Validate CSRF token
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return await renderEditForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or expired form. Please try again.',
      );
    }

    // Check for file upload errors
    if (Object.keys(fileErrors).length > 0) {
      return await renderEditForm(
        ctx,
        columnResult,
        { ...recordToValues(formData), ...fileData },
        undefined,
        fileErrors,
      );
    }

    // Only process columns the user can write to
    const editableColumns = getEditableColumns(table).filter(
      (col) => columnResult.writableColumns.includes(col.name),
    );
    const values = coerceFormValues(formData, editableColumns);

    // Handle file clearing (_clear_{column} fields)
    for (const fileCol of fileColumns) {
      const clearField = `_clear_${fileCol.propertyName}`;
      if (formData[clearField] === '1') {
        // User clicked delete - set to null
        values[fileCol.propertyName] = null;
        // Remove from fileData so it doesn't override
        delete fileData[fileCol.propertyName];
      }
    }

    // Merge in file data for file columns (only if a new file was uploaded)
    for (const [fieldName, fileRef] of Object.entries(fileData)) {
      if (
        columnResult.writableColumns.includes(
          table.columns.find((c) => c.propertyName === fieldName)?.name ?? '',
        )
      ) {
        values[fieldName] = fileRef;
      }
    }

    // Validate form data (uses custom parser if provided, else drizzle-zod)
    const validation = validateWithParsers(
      options,
      table.name,
      drizzleTable,
      values,
      'update',
    );
    if (!validation.success) {
      return await renderEditForm(
        ctx,
        columnResult,
        values,
        validation.formError,
        validation.errors,
      );
    }

    try {
      // Apply beforeSave transform if plugin service available
      let dataToUpdate = validation.data ?? values;
      if (ctx.pluginService) {
        const pluginUser = getPluginUser(ctx);
        dataToUpdate = await ctx.pluginService.beforeSave(
          table.name,
          'update',
          dataToUpdate,
          pluginUser,
        );
      }

      // Update with policy condition (atomic check + update)
      const updateResult = await updateWithPolicy(
        options.db,
        drizzleTable as Table,
        table,
        recordId,
        dataToUpdate,
        policyResult.condition,
      );

      // If 0 rows affected, policy filtered it out (race condition protection)
      if (updateResult.rowsAffected === 0) {
        const exists = await recordExists(
          options.db,
          drizzleTable as Table,
          table,
          recordId,
        );
        if (exists) {
          return redirectWithFlash(
            cmsUrl(basePath, table.name),
            'update_forbidden',
          );
        }
        return redirectWithFlash(
          cmsUrl(basePath, table.name),
          'update_not_found',
        );
      }

      // Save many-to-many relations
      await saveManyToManyData(options, table, recordId, formData);

      // Fire update action hook (may be fire-and-forget)
      if (ctx.pluginService) {
        const pluginUser = getPluginUser(ctx);
        ctx.pluginService.onAction(
          table.name,
          'update',
          recordId,
          pluginUser,
          record,
          { ...record, ...dataToUpdate },
        );
      }

      return redirect(cmsUrl(basePath, table.name, recordId));
    } catch (error) {
      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'update');
      return await renderEditForm(ctx, columnResult, values, safeMessage);
    }
  }

  // Handle GET - show form with readable columns filtered
  const filteredRecord = filterRecordColumns(
    record,
    columnResult.readableColumns,
    table.columns,
  );

  // Execute afterRead transform before displaying form
  let transformedRecord = filteredRecord;
  if (ctx.pluginService) {
    transformedRecord = await ctx.pluginService.afterRead(
      table.name,
      'read',
      filteredRecord,
      getPluginUser(ctx),
    );
  }

  return await renderEditForm(
    ctx,
    columnResult,
    transformedRecord,
    undefined, // formError
    {}, // fieldErrors
    transformedRecord, // record for frontendUrl
  );
}

/**
 * Handle record deletion
 */
export async function handleDelete(ctx: RouteContext): Promise<Response> {
  const { request, options, route, authUser } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const drizzleTable = table.table;

  // Apply row policy for delete action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'delete');

  if (!policyResult.allowed) {
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_forbidden');
  }

  // For delete, also validate CSRF from form data
  if (request.method === 'POST') {
    const formData = await parseFormData(request);
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_error');
    }
  }

  try {
    // Fetch record before deletion for audit purposes
    const recordToDelete = ctx.pluginService
      ? await findRecordWithPolicy(
        options.db,
        drizzleTable as Table,
        table,
        recordId,
        policyResult.condition,
      )
      : null;

    // Delete with policy condition (atomic check + delete)
    const deleteResult = await deleteWithPolicy(
      options.db,
      drizzleTable as Table,
      table,
      recordId,
      policyResult.condition,
    );

    // If 0 rows affected, either doesn't exist or policy filtered it out
    if (deleteResult.rowsAffected === 0) {
      const exists = await recordExists(
        options.db,
        drizzleTable as Table,
        table,
        recordId,
      );
      if (exists) {
        // Record exists but policy denied access
        return redirectWithFlash(
          cmsUrl(basePath, table.name),
          'delete_forbidden',
        );
      }
      // Record doesn't exist
      return redirectWithFlash(
        cmsUrl(basePath, table.name),
        'delete_not_found',
      );
    }

    // Fire delete action hook (may be fire-and-forget)
    if (ctx.pluginService && recordToDelete) {
      const pluginUser = getPluginUser(ctx);
      ctx.pluginService.onAction(
        table.name,
        'delete',
        recordId,
        pluginUser,
        recordToDelete,
        undefined,
      );
    }

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
  columnResult: EvaluatedColumnPolicies,
  values: Record<string, unknown> = {},
  formError?: string,
  fieldErrors: Record<string, string> = {},
): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Filter CMS fields to only include writable columns
  const cmsFields = tableToCmsFields(table, true).filter(
    (field) => columnResult.writableColumns.includes(field.column.name),
  );

  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, undefined);

  // Generate CSRF token
  const csrfToken = await generateCsrfToken(options.csrfSecret);

  // Check if any writable fields are file fields
  const hasFileFields = cmsFields.some((f) => f.fieldType === 'file');

  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    action: cmsUrl(basePath, table.name) + '/new',
    csrfToken,
    multipart: hasFileFields,
  };

  // Merge form-level and field-level errors
  const errors: Record<string, string> = { ...fieldErrors };
  if (formError) {
    errors._form = formError;
  }

  let content = '';
  if (formError) {
    content += alert(formError, 'error');
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

  const page = layout(
    content,
    buildLayoutOptions(ctx, `Create ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page);
}

async function renderEditForm(
  ctx: RouteContext,
  columnResult: EvaluatedColumnPolicies,
  values: Record<string, unknown> = {},
  formError?: string,
  fieldErrors: Record<string, string> = {},
  /** Original record for computing frontendUrl (optional - uses values if not provided) */
  record?: Record<string, unknown>,
): Promise<Response> {
  const { options, route } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Filter CMS fields to only include writable columns
  const cmsFields = tableToCmsFields(table, true).filter(
    (field) => columnResult.writableColumns.includes(field.column.name),
  );

  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, recordId);

  // Generate CSRF token
  const csrfToken = await generateCsrfToken(options.csrfSecret);

  // Check if any writable fields are file fields
  const hasFileFields = cmsFields.some((f) => f.fieldType === 'file');

  // Compute frontend URL from table's $cms() config
  // Use provided record if available, fall back to values (which may be form data or record)
  const frontendUrl = getFrontendUrl(ctx, table, record ?? values, 'update');

  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    csrfToken,
    multipart: hasFileFields,
    frontendUrl,
  };

  // Merge form-level and field-level errors
  const errors: Record<string, string> = { ...fieldErrors };
  if (formError) {
    errors._form = formError;
  }

  let content = '';
  if (formError) {
    content += alert(formError, 'error');
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

  const page = layout(
    content,
    buildLayoutOptions(ctx, `Edit ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page);
}
