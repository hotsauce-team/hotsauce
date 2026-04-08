// Grid view helper functions

import type { Table } from 'drizzle-orm';

import type { CMSField, IntrospectedTable } from '@hotsauce/core';
import { isValidFileKey, isValidFileReference } from '@hotsauce/core';

import { resolveThumbnailUrl } from '@hotsauce/ui';
import type { FieldUIOverride, GridPanelData } from '@hotsauce/ui';

import { generateCsrfToken } from './csrf.ts';
import { fetchManyToManyData, tableToCmsFields } from './crud-helpers.ts';
import { filterRecordColumns, findRecordWithPolicy } from './policies/mod.ts';
import type {
  EvaluatedColumnPolicies,
  PolicyApplicationResult,
} from './policies/mod.ts';
import { generateSourceToken, SOURCE } from './tokens/mod.ts';
import type { ResolvedCmsOptions, RouteContext } from './types.ts';
import type { UIFieldInfo, UIRenderFieldContext } from './plugins/types.ts';
import type { Serializable } from '@hotsauce/workers';

// ─────────────────────────────────────────────────────────────
// Local utility functions (avoid circular imports from crud.ts)
// ─────────────────────────────────────────────────────────────

/**
 * Append a `return` query param to a URL, handling fragments correctly.
 * Uses URL API to avoid breaking URLs with existing query params or fragments.
 */
function appendReturnParam(href: string, returnUrl: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set('return', returnUrl);
    return url.href;
  } catch {
    // Relative URL - parse with dummy base, then reconstruct
    const url = new URL(href, 'http://localhost');
    url.searchParams.set('return', returnUrl);
    return `${url.pathname}${url.search}${url.hash}`;
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
    _plugins: plugins as Record<string, Serializable> | undefined,
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

// ─────────────────────────────────────────────────────────────
// Grid panel helpers
// ─────────────────────────────────────────────────────────────

/**
 * Sign a download URL for a thumbnail's FileReference value.
 * Validates the key belongs to the expected table/column/record before signing.
 * Returns the signed URL or undefined if not applicable or key is invalid.
 */
export async function signThumbnailUrl(
  thumbnailField: CMSField,
  value: unknown,
  options: ResolvedCmsOptions,
  request: Request,
  authUser: RouteContext['authUser'],
  tableName: string,
  recordId: string | number,
): Promise<string | undefined> {
  if (
    thumbnailField.fieldType === 'file' &&
    isValidFileReference(value) && value.key && options.storage
  ) {
    // Validate key belongs to this table/column/record (defense-in-depth)
    if (
      !isValidFileKey(
        value.key,
        tableName,
        thumbnailField.column.name,
        recordId,
      )
    ) {
      return undefined;
    }
    const storageId = value.storage ?? options.storage.defaultObjectStorageId;
    if (storageId) {
      const provider = options.storage.instances.get(storageId);
      if (provider?.signDownloadUrl) {
        try {
          return await provider.signDownloadUrl({
            storage: storageId,
            key: value.key,
            filename: value.filename,
            request,
            user: authUser ? { sub: authUser.id, role: authUser.role } : null,
          });
        } catch {
          // Fall through
        }
      }
    }
  }
  return undefined;
}

/**
 * Build the GridPanelData for the RHS detail panel.
 * Returns undefined if the selected record doesn't exist or is not accessible.
 */
export async function buildGridPanelData(
  ctx: RouteContext,
  table: IntrospectedTable,
  selectedId: string,
  columnResult: EvaluatedColumnPolicies,
  policyResult: PolicyApplicationResult,
  thumbnailField: CMSField,
  relationData: Record<string, import('@hotsauce/ui').RelationOption[]>,
  currentUrl: URL,
): Promise<GridPanelData | undefined> {
  const { request, options, authUser } = ctx;
  const drizzleTable = table.table;

  // Fetch the selected record with policy condition
  const record = await findRecordWithPolicy(
    options.db,
    drizzleTable as Table,
    table,
    selectedId,
    policyResult.condition,
  );

  if (!record) return undefined;

  // Filter by readable columns
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

  // Determine writable fields for the form
  const allCmsFields = tableToCmsFields(table, true);
  const panelFields = allCmsFields
    .filter((field) => {
      if (columnResult.writableColumns.includes(field.column.name)) return true;
      if (
        columnResult.readableColumns.includes(field.column.name) &&
        field.column.cmsOptions?.plugins
      ) {
        return true;
      }
      return false;
    })
    .map((field) => {
      if (!columnResult.writableColumns.includes(field.column.name)) {
        return { ...field, readOnly: true };
      }
      return field;
    });

  // Fetch many-to-many data for this record
  const manyToManyData = await fetchManyToManyData(options, table, selectedId);

  // Resolve thumbnail URL for the panel preview
  const thumbValue = transformedRecord[thumbnailField.column.propertyName];
  const fileUrl = await signThumbnailUrl(
    thumbnailField,
    thumbValue,
    options,
    request,
    authUser,
    table.name,
    selectedId,
  );
  const thumbnailUrl = resolveThumbnailUrl(
    thumbValue,
    thumbnailField.fieldType,
    fileUrl,
  );

  // Extract file metadata if it's a file field
  let fileMeta: GridPanelData['fileMeta'];
  if (thumbnailField.fieldType === 'file' && isValidFileReference(thumbValue)) {
    fileMeta = {
      filename: thumbValue.filename,
      contentType: thumbValue.contentType,
      size: thumbValue.size,
    };
  }

  // Generate tokens
  const csrfToken = await generateCsrfToken(options.csrfSecret);
  const sourceToken = await generateSourceToken(SOURCE.CMS, options.csrfSecret);

  // Check if any writable fields are file fields
  const hasFileFields = panelFields.some((f) => f.fieldType === 'file');

  // Get field UI overrides from plugins
  const fieldOverrides: Record<string, FieldUIOverride> = {};
  if (ctx.pluginService) {
    const user = getPluginUser(ctx);
    const pluginFields = panelFields.filter((f) =>
      f.column.cmsOptions?.plugins ||
      (f.fieldType === 'file' && options.storage)
    );
    const results = await Promise.all(
      pluginFields.map(async (field) => {
        let storageId: string | undefined;
        if (field.fieldType === 'file' && options.storage) {
          const fileValue = transformedRecord[field.column.propertyName];
          if (
            fileValue && typeof fileValue === 'object' &&
            'storage' in fileValue
          ) {
            storageId = (fileValue as { storage?: string }).storage;
          }
          if (!storageId) {
            storageId = options.storage.defaultObjectStorageId;
          }
        }

        const uiCtx: UIRenderFieldContext = {
          table: table.name,
          field: toUIFieldInfo(field),
          value: (transformedRecord[field.column.propertyName] ??
            null) as UIRenderFieldContext['value'],
          recordId: selectedId,
          view: 'edit',
          user,
          storageId,
        };
        return {
          name: field.column.propertyName,
          override: await ctx.pluginService!.renderField(uiCtx),
        };
      }),
    );
    for (const { name, override } of results) {
      if (override) fieldOverrides[name] = override;
    }
  }

  // Build return URL from current list URL, preserving page/sort/view params
  const returnUrlObj = new URL(currentUrl.href);
  returnUrlObj.searchParams.delete('_flash');
  returnUrlObj.searchParams.set('selected', selectedId);
  const returnUrl = `${returnUrlObj.pathname}${returnUrlObj.search}`;

  // Append ?return= to any plugin link hrefs so external pages (e.g. S3 upload)
  // can redirect back to the grid panel after completing their flow
  for (const override of Object.values(fieldOverrides)) {
    if (override?.link?.href) {
      override.link.href = appendReturnParam(override.link.href, returnUrl);
    }
  }

  return {
    id: selectedId,
    thumbnailUrl,
    fileMeta,
    fields: panelFields,
    values: transformedRecord,
    errors: {},
    relationData,
    manyToManyData,
    fieldOverrides,
    csrfToken,
    sourceToken,
    multipart: hasFileFields,
    returnUrl,
  };
}
