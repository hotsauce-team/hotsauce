// CRUD route handlers

import { asc, desc, sql } from 'drizzle-orm';
import type { Table } from 'drizzle-orm';

import type { IntrospectedTable } from '@hotsauce/core';

import { alert, layout, pagination } from '@hotsauce/ui';
import { listTable, listView } from '@hotsauce/ui';
import { gridView, resolveThumbnailUrl, viewToggle } from '@hotsauce/ui';
import type {
  GridPanelData,
  GridThumbnail,
  GridViewOptions,
} from '@hotsauce/ui';
import { detailView } from '@hotsauce/ui';
import { createView, editView } from '@hotsauce/ui';
import { html, raw } from '@hotsauce/ui';
import type { RouteContext, StorageRegistry } from './types.ts';
import {
  coerceFormValues,
  getPagination,
  getSort,
  htmlResponse,
  jsonError,
  jsonSuccess,
  jsonValidationError,
  notFound,
  parseFlashFromUrl,
  parseFormData,
  parseMultipartFormData,
  redirect,
  redirectWithFlash,
  wantsJson,
} from './http.ts';
import { cmsUrl, formatTableName } from './router.ts';
import type {
  DetailViewOptions,
  EditViewOptions,
  FieldUIOverride,
  LayoutOptions,
  ListViewOptions,
  NavItem,
} from '@hotsauce/ui';
import {
  generateCsrfToken,
  getCsrfTokenFromFormData,
  validateCsrfToken,
} from './csrf.ts';
import {
  generateSourceToken,
  getSourceTokenFromFormData,
  SOURCE,
  validateSourceToken,
} from './tokens/mod.ts';
import {
  buildNavItems,
  canAutoCreateDraft,
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
import type { UIFieldInfo, UIRenderFieldContext } from './plugins/types.ts';
import type { CMSField } from '@hotsauce/core';
import {
  getFileKeyPrefix,
  getThumbnailField,
  isValidFileKey,
  isValidFileReference,
} from '@hotsauce/core';
import { buildGridPanelData, signThumbnailUrl } from './grid-helpers.ts';

// ─────────────────────────────────────────────────────────────
// Storage deletion helpers
// ─────────────────────────────────────────────────────────────

/**
 * Delete file objects from storage when they are cleared or replaced.
 *
 * This is called after a successful DB update. Failures are logged but
 * don't fail the request - orphaned files are a storage leak, not a
 * data integrity issue.
 *
 * @param storage - Storage registry
 * @param tableName - Table name (for key validation)
 * @param recordId - Record ID (for key validation)
 * @param oldRecord - Record before update
 * @param newValues - Values being written
 * @param fileColumns - File column metadata
 * @param request - Original request (for tenant context)
 * @param authUser - Authenticated user (for tenant context)
 * @param onError - Error handler for logging
 */
async function deleteOldFileObjects(
  storage: StorageRegistry | undefined,
  tableName: string,
  recordId: string | number,
  oldRecord: Record<string, unknown>,
  newValues: Record<string, unknown>,
  fileColumns: Array<{ propertyName: string; name: string }>,
  request: Request,
  authUser: { id: string; role?: string } | undefined,
  onError?: (error: Error) => void,
): Promise<void> {
  if (!storage) return;

  for (const col of fileColumns) {
    const oldValue = oldRecord[col.propertyName];
    const newValue = newValues[col.propertyName];

    // Skip if old value wasn't a valid file reference
    if (!isValidFileReference(oldValue)) continue;

    // Skip if column was not in the form submission (no change).
    // Explicit null (via _clear_ button) still falls through to delete.
    if (newValue === undefined) continue;

    // Skip if new value is the same (no change)
    if (newValue && typeof newValue === 'object') {
      const newRef = newValue as { key?: string; storage?: string };
      if (newRef.key === oldValue.key && newRef.storage === oldValue.storage) {
        continue;
      }
    }

    // Old file is being cleared or replaced - delete it
    if (oldValue.key) {
      // Defense-in-depth: validate key belongs to this table/column/record
      // Skip deletion if key is invalid (prevents deleting arbitrary keys if DB tampered)
      if (!isValidFileKey(oldValue.key, tableName, col.name, recordId)) {
        const expectedPrefix = getFileKeyPrefix(tableName, col.name, recordId);
        onError?.(
          new Error(
            `Skipping deletion of invalid key: ${oldValue.key} (expected prefix: ${expectedPrefix})`,
          ),
        );
        continue;
      }

      const storageId = oldValue.storage ?? storage.defaultObjectStorageId;
      if (!storageId) continue;

      const provider = storage.instances.get(storageId);
      if (!provider?.deleteObject) continue;

      try {
        await provider.deleteObject({
          storage: storageId,
          key: oldValue.key,
          request,
          user: authUser ? { sub: authUser.id, role: authUser.role } : null,
        });
      } catch (error) {
        // Log error but don't fail the request
        onError?.(error as Error);
      }
    }
  }
}

/** Grace period (ms) — skip objects uploaded within the last 5 minutes to avoid deleting concurrent uploads. */
const ORPHAN_GRACE_MS = 5 * 60 * 1000;

/**
 * After an update, list all objects under each file column's prefix and delete
 * any that are neither the current key nor too recently uploaded.
 *
 * This catches "orphan" files left behind by abandoned uploads that were never
 * saved to the record.  It is fail-soft: errors are logged but don't fail the
 * request.  If the provider doesn't implement `listObjects`, this is a no-op.
 */
async function cleanupOrphanFileObjects(
  storage: StorageRegistry | undefined,
  tableName: string,
  recordId: string | number,
  oldRecord: Record<string, unknown>,
  currentValues: Record<string, unknown>,
  fileColumns: Array<{ propertyName: string; name: string }>,
  request: Request,
  authUser: { id: string; role?: string } | undefined,
  onError?: (error: Error) => void,
): Promise<void> {
  if (!storage) return;

  const now = Date.now();

  for (const col of fileColumns) {
    const curValue = currentValues[col.propertyName];
    if (!isValidFileReference(curValue)) continue;

    // Skip columns where the file didn't change
    const oldValue = oldRecord[col.propertyName];
    if (
      isValidFileReference(oldValue) && oldValue.key === curValue.key &&
      oldValue.storage === curValue.storage
    ) {
      continue;
    }

    const storageId = curValue.storage ?? storage.defaultObjectStorageId;
    if (!storageId) continue;

    const provider = storage.instances.get(storageId);
    if (!provider?.listObjects) continue;
    const deleteObject = provider.deleteObject;
    if (!deleteObject) continue;

    const prefix = getFileKeyPrefix(tableName, col.name, recordId);
    const currentKey = curValue.key;

    try {
      const objects = await provider.listObjects(prefix);

      // Filter to orphans (not current key, not recently uploaded)
      const orphans = objects.filter((obj) => {
        if (obj.key === currentKey) return false;
        if (
          obj.lastModified && now - obj.lastModified.getTime() < ORPHAN_GRACE_MS
        ) return false;
        return true;
      });

      // Delete all orphans concurrently
      await Promise.all(orphans.map(async (obj) => {
        try {
          await deleteObject({
            storage: storageId,
            key: obj.key,
            request,
            user: authUser ? { sub: authUser.id, role: authUser.role } : null,
          });
        } catch (err) {
          onError?.(err as Error);
        }
      }));
    } catch (error) {
      onError?.(error as Error);
    }
  }
}

/**
 * Convert CMSField to serializable UIFieldInfo for plugin hooks
 */
function toUIFieldInfo(field: CMSField): UIFieldInfo {
  const plugins = field.column.cmsOptions?.plugins as
    | Record<string, unknown>
    | undefined;
  return {
    name: field.column.name,
    label: field.label,
    fieldType: field.fieldType,
    columnType: field.column.columnType,
    required: field.column.notNull && !field.column.hasDefault,
    readOnly: field.readOnly ?? false,
    // Pass all plugin configs; executor extracts per-plugin
    _plugins: plugins as
      | Record<string, import('@hotsauce/workers').Serializable>
      | undefined,
  };
}

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
    scriptUrl: `${basePath}/admin.js`,
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
            source: 'handler',
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
            source: 'handler',
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
          source: 'handler',
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

  // Filter out junction tables and tables marked as hidden via $cms({ hidden: true })
  const visibleTables = options.introspected.tables.filter((t) =>
    !t.isJunction && !t.cmsOptions?.hidden
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

  return htmlResponse(page, 200, ctx.options.securityHeaders);
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
      table,
    );
  }

  // Execute list action hooks (fire-and-forget for audit logging etc.)
  if (ctx.pluginService) {
    ctx.pluginService.onAction(
      table.name,
      'list',
      undefined,
      getPluginUser(ctx),
      undefined,
      undefined,
      table,
    );
  }

  // Generate navigation
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Detect thumbnail field for grid view
  const cmsFields = tableToCmsFields(table);
  const thumbnailField = getThumbnailField(cmsFields);

  // Determine view mode: default to grid if thumbnail exists, otherwise table
  const viewParam = url.searchParams.get('view');
  const viewMode = thumbnailField
    ? (viewParam === 'table' ? 'table' as const : 'grid' as const)
    : 'table' as const;

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

  // Generate CSRF token for delete forms
  const csrfToken = await generateCsrfToken(options.csrfSecret);

  // Build content
  let content = '';

  // Add flash message if present (from URL params or context)
  const flash = ctx.flash ?? parseFlashFromUrl(url);
  if (flash) {
    content += alert(flash.message, flash.type);
  }

  if (viewMode === 'grid' && thumbnailField) {
    // Resolve thumbnail URLs for each record
    const thumbnails: GridThumbnail[] = await Promise.all(
      records.map(async (record) => {
        const id = record[pkCol.propertyName] as string | number;
        const value = record[thumbnailField.column.propertyName];
        const fileUrl = await signThumbnailUrl(
          thumbnailField,
          value,
          options,
          request,
          authUser,
        );

        const thumbnailUrl = resolveThumbnailUrl(
          value,
          thumbnailField.fieldType,
          fileUrl,
        );

        const label = isValidFileReference(value) ? value.filename : String(id);

        return { id, thumbnailUrl, label };
      }),
    );

    // Check for selected record (RHS detail panel)
    const selectedParam = url.searchParams.get('selected');
    let panelData: GridPanelData | undefined;

    if (selectedParam) {
      panelData = await buildGridPanelData(
        ctx,
        table,
        selectedParam,
        columnResult,
        policyResult,
        thumbnailField,
        relationData,
        url,
      );
    }

    const gridOptions: GridViewOptions = {
      baseUrl: cmsUrl(basePath, table.name),
      primaryKey: pkCol.propertyName,
      thumbnailField,
      currentView: 'grid',
      currentUrl: url.href,
      selectedId: selectedParam ?? undefined,
    };

    content += gridView(
      formatTableName(table.name),
      records,
      thumbnails,
      gridOptions,
      panelData,
    );
  } else {
    // Table view (default for non-thumbnail tables, or explicit ?view=table)
    const listOptions: ListViewOptions = {
      baseUrl: cmsUrl(basePath, table.name),
      primaryKey: getPrimaryKeyColumn(table).name,
      showEdit: true,
      showDelete: true,
      showView: true,
      csrfToken,
    };

    // Add view toggle header when thumbnail exists but table view is selected
    if (thumbnailField) {
      const toggle = viewToggle('table', url.href);
      content += `<div class="cms-list-view">
        <header class="cms-list-header">
          <h1>${formatTableName(table.name)}</h1>
          <div class="cms-list-actions">
            ${toggle}
            <a href="${
        cmsUrl(basePath, table.name)
      }/new" class="cms-btn cms-btn-primary">Create New</a>
          </div>
        </header>
        ${
        listTable(
          listColumns,
          records,
          listOptions,
          relationData,
          m2mDisplayData,
        )
      }
      </div>`;
    } else {
      content += listView(
        formatTableName(table.name),
        listColumns,
        records,
        listOptions,
        relationData,
        m2mDisplayData,
      );
    }
  }

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

  return htmlResponse(pageHtml, 200, ctx.options.securityHeaders);
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
      table,
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
      table,
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

  // Get field UI overrides from plugins (parallel for performance)
  // Only process fields with plugin config OR file fields when storage is configured
  const fieldOverrides: Record<string, FieldUIOverride> = {};
  const pluginService = ctx.pluginService;
  if (pluginService) {
    const user = getPluginUser(ctx);
    const pluginFields = cmsFields.filter((f) =>
      f.column.cmsOptions?.plugins ||
      (f.fieldType === 'file' && options.storage)
    );
    const results = await Promise.all(
      pluginFields.map(async (field) => {
        // Compute storageId for file fields
        // For detail view, use the file's storage field (from existing data)
        // rather than resolveStorage (which is for write operations)
        let storageId: string | undefined;
        if (field.fieldType === 'file' && options.storage) {
          const fileValue = transformedRecord[field.column.propertyName];
          if (
            fileValue && typeof fileValue === 'object' &&
            'storage' in fileValue
          ) {
            // Use the storage ID from the existing file
            storageId = (fileValue as { storage?: string }).storage;
          }
          // Fall back to default if no file or no storage field
          if (!storageId) {
            storageId = options.storage.defaultObjectStorageId;
          }
        }

        const uiCtx: UIRenderFieldContext = {
          table: table.name,
          field: toUIFieldInfo(field),
          value: (transformedRecord[field.column.propertyName] ??
            null) as UIRenderFieldContext['value'],
          recordId: recordId,
          view: 'detail',
          user,
          storageId,
        };
        return {
          name: field.column.propertyName,
          override: await pluginService.renderField(uiCtx),
        };
      }),
    );
    for (const { name, override } of results) {
      if (override) fieldOverrides[name] = override;
    }
  }

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
    fieldOverrides,
  );

  const page = layout(
    content,
    buildLayoutOptions(ctx, `View ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page, 200, ctx.options.securityHeaders);
}

/**
 * Render the create form or handle form submission
 */
export async function handleCreate(ctx: RouteContext): Promise<Response> {
  const { request, options, route, authUser } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const drizzleTable = table.table;
  const isJsonRequest = wantsJson(request);

  // Apply row policy for create action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to create records in this table.',
      );
    }
    return redirectWithFlash(cmsUrl(basePath, table.name), 'create_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'create');

  // For create, policy can only allow or deny (no filtering)
  if (!policyResult.allowed) {
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to create records in this table.',
      );
    }
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
      if (isJsonRequest) {
        return jsonValidationError('create', table.name, {
          _form: 'Invalid or expired form. Please try again.',
        });
      }
      return await renderCreateForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or expired form. Please try again.',
      );
    }

    // Validate source token and get source identifier
    const sourceTokenValue = getSourceTokenFromFormData(formData);
    const source = await validateSourceToken(
      sourceTokenValue,
      options.csrfSecret,
    );

    // Source token is required for all write operations
    // Without a valid source token, no fields can be modified
    if (!source) {
      if (isJsonRequest) {
        return jsonValidationError('create', table.name, {
          _form: 'Invalid or missing source token. Please reload the form.',
        });
      }
      return await renderCreateForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or missing source token. Please reload the form.',
      );
    }

    // Re-evaluate column policies with source context for write operations
    // This allows policies to check ctx.source for plugin-specific write permissions
    const policyCtxWithSource = createPolicyContext(request, authUser, source);
    const columnResultWithSource = await evaluateColumnPolicies(
      columnPolicies,
      table.columns,
      policyCtxWithSource,
    );

    // Validate that all required columns are writable or have defaults (with source context)
    const hiddenErrorsWithSource = validateHiddenRequiredColumns(
      table.columns,
      columnResultWithSource,
    );
    if (hiddenErrorsWithSource.length > 0) {
      const errorMessages = hiddenErrorsWithSource.map((e) => e.message).join(
        ' ',
      );
      return await renderCreateForm(
        ctx,
        columnResult,
        recordToValues(formData),
        `Configuration error: ${errorMessages}`,
      );
    }

    // Check for file upload errors
    if (Object.keys(fileErrors).length > 0) {
      if (isJsonRequest) {
        return jsonValidationError('create', table.name, fileErrors);
      }
      return await renderCreateForm(
        ctx,
        columnResult,
        { ...recordToValues(formData), ...fileData },
        undefined,
        fileErrors,
      );
    }

    // Only process columns the user can write to (based on source-aware policies)
    const editableColumns = getEditableColumns(table).filter(
      (col) => columnResultWithSource.writableColumns.includes(col.name),
    );
    let values = coerceFormValues(formData, editableColumns);

    // Merge in file data for file columns
    for (const [fieldName, fileRef] of Object.entries(fileData)) {
      if (
        columnResultWithSource.writableColumns.includes(
          table.columns.find((c) => c.propertyName === fieldName)?.name ?? '',
        )
      ) {
        values[fieldName] = fileRef;
      }
    }

    // Reject file references with storage keys during create
    // The presign flow requires an existing record ID, so any key submission
    // during create is either tampered or from an unsupported client workflow
    if (fileColumns.length > 0) {
      const fileKeyErrors: Record<string, string> = {};
      for (const col of fileColumns) {
        const value = values[col.propertyName];
        if (!value || typeof value !== 'object') continue;

        const fileRef = value as { key?: string };
        if (fileRef.key) {
          fileKeyErrors[col.propertyName] =
            'Storage-backed files cannot be attached during create. Save the record first, then upload.';
        }
      }

      if (Object.keys(fileKeyErrors).length > 0) {
        if (isJsonRequest) {
          return jsonValidationError('create', table.name, fileKeyErrors);
        }
        return await renderCreateForm(
          ctx,
          columnResult,
          values,
          undefined,
          fileKeyErrors,
        );
      }
    }

    // Inject default values for non-writable columns (source-aware)
    values = injectColumnDefaults(values, columnResultWithSource.defaults);

    // Validate form data (uses custom parser if provided, else drizzle-zod)
    const validation = validateWithParsers(
      options,
      table.name,
      drizzleTable,
      values,
      'insert',
    );
    if (!validation.success) {
      if (isJsonRequest) {
        const errors: Record<string, string> = { ...validation.errors };
        if (validation.formError) errors._form = validation.formError;
        return jsonValidationError('create', table.name, errors);
      }
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
          table,
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
          table,
        );
      }

      if (isJsonRequest) {
        return jsonSuccess(
          'create',
          table.name,
          newId,
          cmsUrl(basePath, table.name, newId),
        );
      }
      return redirect(cmsUrl(basePath, table.name, newId));
    } catch (error) {
      // Log unexpected errors
      if (options.onError) {
        options.onError(
          error instanceof Error ? error : new Error(String(error)),
          {
            source: 'handler',
            request,
            url: new URL(request.url),
            route: route,
            table,
            action: 'create',
          },
        );
      }

      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'create');
      if (isJsonRequest) {
        return jsonValidationError('create', table.name, {
          _form: safeMessage,
        });
      }
      return await renderCreateForm(ctx, columnResult, values, safeMessage);
    }
  }

  // Handle GET - show form (or auto-create draft if configured)
  if (table.cmsOptions?.autoDraft && canAutoCreateDraft(table)) {
    try {
      // Insert a row with all defaults and redirect to edit
      const result = await options.db
        .insert(drizzleTable)
        .values({} as Record<string, never>)
        .returning();

      const newRecord = result[0] as Record<string, unknown>;
      const newId = getPrimaryKeyValue(table, newRecord);

      return redirect(cmsUrl(basePath, table.name, newId, 'edit'));
    } catch (error) {
      // Log and fall through to normal create form
      if (options.onError) {
        options.onError(
          error instanceof Error ? error : new Error(String(error)),
          {
            source: 'handler',
            request,
            url: new URL(request.url),
            route: route,
            table,
            action: 'create',
          },
        );
      }
      const safeMessage = getSafeErrorMessage(error, 'create');
      return await renderCreateForm(ctx, columnResult, {}, safeMessage);
    }
  }

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
  const isJsonRequest = wantsJson(request);

  // Apply row policy for update action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to update this record.',
      );
    }
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
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to update this record.',
      );
    }
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
      if (isJsonRequest) {
        return jsonError(
          'forbidden',
          'You do not have permission to update this record.',
        );
      }
      return redirectWithFlash(
        cmsUrl(basePath, table.name),
        'update_forbidden',
      );
    }
    if (isJsonRequest) {
      return jsonError('not_found', 'Record not found.');
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
      if (isJsonRequest) {
        return jsonValidationError('update', table.name, {
          _form: 'Invalid or expired form. Please try again.',
        }, recordId);
      }
      return await renderEditForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or expired form. Please try again.',
      );
    }

    // Validate source token and get source identifier
    const sourceTokenValue = getSourceTokenFromFormData(formData);
    const source = await validateSourceToken(
      sourceTokenValue,
      options.csrfSecret,
    );

    // Source token is required for all write operations
    // Without a valid source token, no fields can be modified
    if (!source) {
      if (isJsonRequest) {
        return jsonValidationError('update', table.name, {
          _form: 'Invalid or missing source token. Please reload the form.',
        }, recordId);
      }
      return await renderEditForm(
        ctx,
        columnResult,
        recordToValues(formData),
        'Invalid or missing source token. Please reload the form.',
      );
    }

    // Re-evaluate column policies with source context for write operations
    // This allows policies to check ctx.source for plugin-specific write permissions
    const policyCtxWithSource = createPolicyContext(request, authUser, source);
    const columnResultWithSource = await evaluateColumnPolicies(
      columnPolicies,
      table.columns,
      policyCtxWithSource,
    );

    // Check for file upload errors
    if (Object.keys(fileErrors).length > 0) {
      if (isJsonRequest) {
        return jsonValidationError('update', table.name, fileErrors, recordId);
      }
      return await renderEditForm(
        ctx,
        columnResult,
        { ...recordToValues(formData), ...fileData },
        undefined,
        fileErrors,
      );
    }

    // Only process columns the user can write to (based on source-aware policies)
    const editableColumns = getEditableColumns(table).filter(
      (col) => columnResultWithSource.writableColumns.includes(col.name),
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
        columnResultWithSource.writableColumns.includes(
          table.columns.find((c) => c.propertyName === fieldName)?.name ?? '',
        )
      ) {
        values[fieldName] = fileRef;
      }
    }

    // Validate file reference keys match this record (prevents key tampering)
    // This ensures clients can only submit keys that were presigned for this specific record
    if (fileColumns.length > 0) {
      const fileKeyErrors: Record<string, string> = {};

      for (const col of fileColumns) {
        const value = values[col.propertyName];
        if (!value || typeof value !== 'object') continue;

        const fileRef = value as { key?: string; storage?: string };
        if (!fileRef.key) continue; // No key = inline data or URL-based, skip

        // Validate key prefix: {table}/{column}/{recordId}/
        if (!isValidFileKey(fileRef.key, table.name, col.name, recordId)) {
          fileKeyErrors[col.propertyName] =
            'Invalid file reference. Please re-upload the file.';
          continue;
        }

        // Compute expected storage ID using same logic as presign:
        // 1. Use resolveStorage callback if configured (same context as presign)
        // 2. Fall back to defaultObjectStorageId
        let expectedStorageId: string | undefined;
        if (options.storage?.resolveStorage) {
          expectedStorageId = options.storage.resolveStorage({
            request,
            user: authUser ? { sub: authUser.id, role: authUser.role } : null,
            table: table.name,
            column: col.name,
            action: 'update',
            recordId: String(recordId),
          });
        } else {
          expectedStorageId = options.storage?.defaultObjectStorageId;
        }

        // No storage provider expected — reject key (inline DB storage only)
        if (expectedStorageId === undefined) {
          fileKeyErrors[col.propertyName] =
            'This field does not use external storage. Please re-upload the file.';
          continue;
        }

        // Validate expectedStorageId is actually registered
        if (!options.storage?.instances.has(expectedStorageId)) {
          fileKeyErrors[col.propertyName] =
            `Storage provider '${expectedStorageId}' is not registered. Check your CMS storage configuration.`;
          continue;
        }

        // Normalize: if client omitted storage but sent a key, fill from config
        if (fileRef.key && !fileRef.storage) {
          fileRef.storage = expectedStorageId;
        }

        // Validate storage provider ID matches expected
        if (fileRef.storage !== expectedStorageId) {
          fileKeyErrors[col.propertyName] =
            'Invalid storage provider. Please re-upload the file.';
        }
      }

      if (Object.keys(fileKeyErrors).length > 0) {
        if (isJsonRequest) {
          return jsonValidationError(
            'update',
            table.name,
            fileKeyErrors,
            recordId,
          );
        }
        return await renderEditForm(
          ctx,
          columnResult,
          values,
          undefined,
          fileKeyErrors,
        );
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
      if (isJsonRequest) {
        const errors: Record<string, string> = { ...validation.errors };
        if (validation.formError) errors._form = validation.formError;
        return jsonValidationError('update', table.name, errors, recordId);
      }
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
          table,
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
          if (isJsonRequest) {
            return jsonError(
              'forbidden',
              'You do not have permission to update this record.',
            );
          }
          return redirectWithFlash(
            cmsUrl(basePath, table.name),
            'update_forbidden',
          );
        }
        if (isJsonRequest) {
          return jsonError('not_found', 'Record not found.');
        }
        return redirectWithFlash(
          cmsUrl(basePath, table.name),
          'update_not_found',
        );
      }

      // Save many-to-many relations
      await saveManyToManyData(options, table, recordId, formData);

      // Delete old file objects from storage (eager delete)
      // This happens after successful DB write - failures are logged but don't fail the request
      if (fileColumns.length > 0) {
        await deleteOldFileObjects(
          options.storage,
          table.name,
          recordId,
          record,
          dataToUpdate,
          fileColumns,
          request,
          authUser,
          options.onError
            ? (err) =>
              options.onError!(err, {
                source: 'handler',
                request,
                url: new URL(request.url),
                route,
                table,
                action: 'update',
              })
            : undefined,
        );

        // Orphan cleanup: list all objects under the prefix and delete stale ones
        await cleanupOrphanFileObjects(
          options.storage,
          table.name,
          recordId,
          record,
          dataToUpdate,
          fileColumns,
          request,
          authUser,
          options.onError
            ? (err) =>
              options.onError!(err, {
                source: 'handler',
                request,
                url: new URL(request.url),
                route,
                table,
                action: 'update',
              })
            : undefined,
        );
      }

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
          table,
        );
      }

      if (isJsonRequest) {
        return jsonSuccess(
          'update',
          table.name,
          recordId,
          cmsUrl(basePath, table.name, recordId),
        );
      }
      // Check for __cms_return field (grid panel redirect)
      const returnUrl = getSafeReturnUrl(formData, basePath);
      return redirect(returnUrl ?? cmsUrl(basePath, table.name, recordId));
    } catch (error) {
      // Log unexpected errors
      if (options.onError) {
        options.onError(
          error instanceof Error ? error : new Error(String(error)),
          {
            source: 'handler',
            request,
            url: new URL(request.url),
            route: route,
            table,
            action: 'update',
          },
        );
      }

      // Re-render form with safe error message
      const safeMessage = getSafeErrorMessage(error, 'update');
      if (isJsonRequest) {
        return jsonValidationError(
          'update',
          table.name,
          { _form: safeMessage },
          recordId,
        );
      }
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
      table,
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
  const isJsonRequest = wantsJson(request);

  // Apply row policy for delete action
  // If auth is enabled but policies are undefined, deny access (secure by default)
  if (options.auth && !options.policies) {
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to delete this record.',
      );
    }
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_forbidden');
  }
  const tablePolicy = options.policies?.[table.name];
  const rowPolicy = extractRowPolicy(tablePolicy);
  const policyCtx = createPolicyContext(request, authUser);
  const policyResult = await applyPolicy(rowPolicy, policyCtx, 'delete');

  if (!policyResult.allowed) {
    if (isJsonRequest) {
      return jsonError(
        'forbidden',
        'You do not have permission to delete this record.',
      );
    }
    return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_forbidden');
  }

  // For delete, also validate CSRF from form data
  let deleteReturnUrl: string | undefined;
  if (request.method === 'POST') {
    const formData = await parseFormData(request);
    const csrfToken = getCsrfTokenFromFormData(formData);
    if (!await validateCsrfToken(csrfToken, options.csrfSecret)) {
      if (isJsonRequest) {
        return jsonValidationError('delete', table.name, {
          _form: 'Invalid or expired form. Please try again.',
        }, recordId);
      }
      return redirectWithFlash(
        cmsUrl(basePath, table.name),
        'delete_csrf_error',
      );
    }
    deleteReturnUrl = getSafeReturnUrl(formData, basePath);
  }

  try {
    // Check if we need to fetch record before delete
    // - For plugin hooks (audit log, etc.)
    // - For storage cleanup (delete S3 objects)
    const fileColumns = table.columns.filter((col) => col.cmsOptions?.file);
    const needsStorageCleanup = options.storage && fileColumns.length > 0;
    const needsRecordSnapshot = ctx.pluginService || needsStorageCleanup;

    // Fetch record before deletion if needed
    const recordToDelete = needsRecordSnapshot
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
        if (isJsonRequest) {
          return jsonError(
            'forbidden',
            'You do not have permission to delete this record.',
          );
        }
        return redirectWithFlash(
          cmsUrl(basePath, table.name),
          'delete_forbidden',
        );
      }
      // Record doesn't exist
      if (isJsonRequest) {
        return jsonError('not_found', 'Record not found.');
      }
      return redirectWithFlash(
        cmsUrl(basePath, table.name),
        'delete_not_found',
      );
    }

    // Clean up storage objects for deleted record (fail-soft)
    if (needsStorageCleanup && recordToDelete) {
      // Build explicit null values so deleteOldFileObjects sees "cleared" (not "absent")
      const clearedFileValues: Record<string, null> = {};
      for (const col of fileColumns) {
        clearedFileValues[col.propertyName] = null;
      }
      await deleteOldFileObjects(
        options.storage,
        table.name,
        recordId,
        recordToDelete,
        clearedFileValues,
        fileColumns.map((col) => ({
          propertyName: col.propertyName,
          name: col.name,
        })),
        request,
        authUser ? { id: authUser.id, role: authUser.role } : undefined,
        options.onError
          ? (err) =>
            options.onError!(err, {
              source: 'handler',
              request,
              url: new URL(request.url),
              route,
              table,
              action: 'delete',
            })
          : undefined,
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
        table,
      );
    }

    if (isJsonRequest) {
      return jsonSuccess(
        'delete',
        table.name,
        recordId,
        cmsUrl(basePath, table.name),
      );
    }
    return redirectWithFlash(
      deleteReturnUrl ?? cmsUrl(basePath, table.name),
      'delete_success',
    );
  } catch (error) {
    // Use helper to check for FK violation
    if (isForeignKeyViolation(error)) {
      if (isJsonRequest) {
        return jsonValidationError('delete', table.name, {
          _form:
            'Cannot delete this record because it is referenced by other records. Remove those references first.',
        }, recordId);
      }
      return redirectWithFlash(cmsUrl(basePath, table.name), 'delete_fk_error');
    }

    // Log unexpected errors
    if (options.onError) {
      options.onError(
        error instanceof Error ? error : new Error(String(error)),
        {
          source: 'handler',
          request,
          url: new URL(request.url),
          route: route,
          table,
          action: 'delete',
        },
      );
    }

    if (isJsonRequest) {
      return jsonValidationError('delete', table.name, {
        _form: 'Failed to delete record. Please try again.',
      }, recordId);
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
  const { options, route, pluginService } = ctx;
  const table = route.table!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Filter CMS fields to only include writable columns
  // Also include plugin-controlled columns as read-only (so plugins can add custom UI like "Edit with Puck")
  const allCmsFields = tableToCmsFields(table, true);
  const cmsFields = allCmsFields
    .filter((field) => {
      // Always include writable columns
      if (columnResult.writableColumns.includes(field.column.name)) return true;
      // Include readable columns that have plugin configuration (show as read-only)
      if (
        columnResult.readableColumns.includes(field.column.name) &&
        field.column.cmsOptions?.plugins
      ) {
        return true;
      }
      return false;
    })
    .map((field) => {
      // Mark non-writable columns as read-only
      if (!columnResult.writableColumns.includes(field.column.name)) {
        return { ...field, readOnly: true };
      }
      return field;
    });

  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, undefined);

  // Generate CSRF and source tokens
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  const sourceToken = await generateSourceToken(SOURCE.CMS, options.csrfSecret);

  // Check if any writable fields are file fields
  const hasFileFields = cmsFields.some((f) => f.fieldType === 'file');

  // Get field UI overrides from plugins (parallel for performance)
  // Only process fields with plugin config OR file fields when storage is configured
  const fieldOverrides: Record<string, FieldUIOverride> = {};
  if (pluginService) {
    const user = getPluginUser(ctx);
    const pluginFields = cmsFields.filter((f) =>
      f.column.cmsOptions?.plugins ||
      (f.fieldType === 'file' && options.storage)
    );
    const results = await Promise.all(
      pluginFields.map(async (field) => {
        // Compute storageId for file fields
        let storageId: string | undefined;
        if (field.fieldType === 'file' && options.storage) {
          if (options.storage.resolveStorage) {
            storageId = options.storage.resolveStorage({
              request: ctx.request,
              user: user ?? null,
              table: table.name,
              column: field.column.name,
              action: 'create',
              recordId: undefined,
            });
          } else {
            storageId = options.storage.defaultObjectStorageId;
          }
        }

        const uiCtx: UIRenderFieldContext = {
          table: table.name,
          field: toUIFieldInfo(field),
          value:
            (values[field.column.propertyName] ?? null) as UIRenderFieldContext[
              'value'
            ],
          recordId: undefined, // create view has no record ID
          view: 'create',
          user,
          storageId,
        };
        return {
          name: field.column.propertyName,
          override: await pluginService.renderField(uiCtx),
        };
      }),
    );
    for (const { name, override } of results) {
      if (override) fieldOverrides[name] = override;
    }
  }

  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    action: cmsUrl(basePath, table.name) + '/new',
    csrfToken,
    sourceToken,
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
    fieldOverrides,
  );

  const page = layout(
    content,
    buildLayoutOptions(ctx, `Create ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page, 200, ctx.options.securityHeaders);
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
  const { options, route, pluginService } = ctx;
  const table = route.table!;
  const recordId = route.recordId!;
  const basePath = options.basePath;
  const navItems = buildNavItems(options.introspected, basePath, table.name);

  // Filter CMS fields to only include writable columns
  // Also include plugin-controlled columns as read-only (so plugins can add custom UI like "Edit with Puck")
  const allCmsFields = tableToCmsFields(table, true);
  const cmsFields = allCmsFields
    .filter((field) => {
      // Always include writable columns
      if (columnResult.writableColumns.includes(field.column.name)) return true;
      // Include readable columns that have plugin configuration (show as read-only)
      if (
        columnResult.readableColumns.includes(field.column.name) &&
        field.column.cmsOptions?.plugins
      ) {
        return true;
      }
      return false;
    })
    .map((field) => {
      // Mark non-writable columns as read-only
      if (!columnResult.writableColumns.includes(field.column.name)) {
        return { ...field, readOnly: true };
      }
      return field;
    });

  const relationData = await fetchAllRelationOptions(options, table);
  const manyToManyData = await fetchManyToManyData(options, table, recordId);

  // Generate CSRF and source tokens
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  const sourceToken = await generateSourceToken(SOURCE.CMS, options.csrfSecret);

  // Check if any writable fields are file fields
  const hasFileFields = cmsFields.some((f) => f.fieldType === 'file');

  // Compute frontend URL from table's $cms() config
  // Use provided record if available, fall back to values (which may be form data or record)
  const frontendUrl = getFrontendUrl(ctx, table, record ?? values, 'update');

  // Get field UI overrides from plugins (parallel for performance)
  // Only process fields with plugin config OR file fields when storage is configured
  const fieldOverrides: Record<string, FieldUIOverride> = {};
  if (pluginService) {
    const user = getPluginUser(ctx);
    const pluginFields = cmsFields.filter((f) =>
      f.column.cmsOptions?.plugins ||
      (f.fieldType === 'file' && options.storage)
    );
    const results = await Promise.all(
      pluginFields.map(async (field) => {
        // Compute storageId for file fields
        let storageId: string | undefined;
        if (field.fieldType === 'file' && options.storage) {
          if (options.storage.resolveStorage) {
            storageId = options.storage.resolveStorage({
              request: ctx.request,
              user: user ?? null,
              table: table.name,
              column: field.column.name,
              action: 'update',
              recordId: String(recordId),
            });
          } else {
            storageId = options.storage.defaultObjectStorageId;
          }
        }

        const uiCtx: UIRenderFieldContext = {
          table: table.name,
          field: toUIFieldInfo(field),
          value:
            (values[field.column.propertyName] ?? null) as UIRenderFieldContext[
              'value'
            ],
          recordId: recordId,
          view: 'edit',
          user,
          storageId,
        };
        return {
          name: field.column.propertyName,
          override: await pluginService.renderField(uiCtx),
        };
      }),
    );
    for (const { name, override } of results) {
      if (override) fieldOverrides[name] = override;
    }
  }

  const editOptions: EditViewOptions = {
    baseUrl: cmsUrl(basePath, table.name),
    id: recordId,
    csrfToken,
    sourceToken,
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
    fieldOverrides,
  );

  const page = layout(
    content,
    buildLayoutOptions(ctx, `Edit ${formatTableName(table.name)}`, navItems),
  );

  return htmlResponse(page, 200, ctx.options.securityHeaders);
}

// ─────────────────────────────────────────────────────────────
// Return URL validation
// ─────────────────────────────────────────────────────────────

/**
 * Extract and validate a __cms_return URL from form data.
 * Only allows relative URLs that start with the CMS basePath (prevents open redirect).
 *
 * Defense-in-depth checks aligned with packages/ui/html.ts:getSafeUrl.
 */
function getSafeReturnUrl(
  formData: Record<string, string | string[]>,
  basePath: string,
): string | undefined {
  const returnVal = formData['__cms_return'];
  const returnUrl = Array.isArray(returnVal) ? returnVal[0] : returnVal;
  if (!returnUrl || typeof returnUrl !== 'string') return undefined;

  // Block control characters and backslashes (scheme obfuscation / header injection vectors)
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f-\x9f\\]/.test(returnUrl)) return undefined;
  // Block percent-encoded control chars (%00-%1F, %7F)
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(returnUrl)) return undefined;

  // Must be a relative path starting with basePath
  if (returnUrl !== basePath && !returnUrl.startsWith(basePath + '/')) {
    return undefined;
  }

  // Must not contain protocol or authority markers (prevent //evil.com)
  if (returnUrl.includes('://') || returnUrl.startsWith('//')) return undefined;

  return returnUrl;
}

// Grid panel helpers moved to ./grid-helpers.ts
