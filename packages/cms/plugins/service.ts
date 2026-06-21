// Plugin service - higher-level API for executing plugin hooks
// Used by CRUD handlers to invoke plugins at the right points

import type { IntrospectedTable } from '@hotsauce/core';
import type { CrudAction } from '../types.ts';
import type {
  ActionContext,
  FieldUIOverride,
  FilterContext,
  FlashMessage,
  HookType,
  PluginContext,
  ResolveFlashesContext,
  Serializable,
  UIRenderFieldContext,
} from './types.ts';
import type { PluginRegistry, RegisteredPlugin } from './registry.ts';
import { WorkerExecutor } from '@hotsauce/workers';
import type { PluginErrorHandler } from '@hotsauce/workers';

// Re-export for convenience
export type { PluginErrorHandler } from '@hotsauce/workers';

// ─────────────────────────────────────────────────────────────
// Plugin scope extraction
// ─────────────────────────────────────────────────────────────

/**
 * Plugin scope info extracted from schema metadata.
 * Determines what data a plugin can access.
 */
interface PluginScope {
  /** Column configs for this plugin, keyed by column name */
  columns: Record<string, Serializable>;
  /** True if this is table-scoped (plugin declared on table, not columns) */
  isTableScoped: boolean;
}

/**
 * Extract plugin scope from introspected table metadata.
 * Returns column configs for columns that declare this plugin.
 *
 * @param tableInfo - Introspected table metadata
 * @param pluginName - Name of the plugin
 * @returns Plugin scope or null if no declarations found
 */
function extractPluginScope(
  tableInfo: IntrospectedTable | undefined,
  pluginName: string,
): PluginScope | null {
  if (!tableInfo) return null;

  // Check for table-level plugin declaration
  const tablePlugins = tableInfo.cmsOptions?.plugins;
  if (tablePlugins && pluginName in tablePlugins) {
    return {
      columns: { _table: tablePlugins[pluginName] as Serializable },
      isTableScoped: true,
    };
  }

  // Check for column-level plugin declarations
  const columnConfigs: Record<string, Serializable> = {};
  for (const col of tableInfo.columns) {
    const colPlugins = col.cmsOptions?.plugins;
    if (colPlugins && pluginName in colPlugins) {
      // Use propertyName (camelCase) to match Drizzle data keys
      columnConfigs[col.propertyName] = colPlugins[pluginName] as Serializable;
    }
  }

  if (Object.keys(columnConfigs).length === 0) {
    return null;
  }

  return {
    columns: columnConfigs,
    isTableScoped: false,
  };
}

/**
 * Scope data to only columns declared for this plugin.
 * For table-scoped plugins, returns full data.
 *
 * @param data - Full record data
 * @param scope - Plugin scope info
 * @returns Scoped data subset
 */
function scopeData(
  data: Record<string, unknown>,
  scope: PluginScope,
): Record<string, unknown> {
  // Table-scoped: full data access
  if (scope.isTableScoped) return data;

  // Column-scoped: only declared columns
  const scoped: Record<string, unknown> = {};
  for (const colName of Object.keys(scope.columns)) {
    if (colName in data) {
      scoped[colName] = data[colName];
    }
  }
  return scoped;
}

/**
 * Merge scoped data back into full data.
 * For table-scoped plugins, returns the full result.
 * For column-scoped plugins, only merges declared columns.
 *
 * @param fullData - Original full record data
 * @param scopedResult - Result from plugin (scoped or full)
 * @param scope - Plugin scope info
 * @returns Merged data
 */
function mergeScopedData(
  fullData: Record<string, unknown>,
  scopedResult: Record<string, unknown>,
  scope: PluginScope,
): Record<string, unknown> {
  // Table-scoped: plugin can modify anything
  if (scope.isTableScoped) return scopedResult;

  // Column-scoped: only merge declared columns
  const merged = { ...fullData };
  for (const colName of Object.keys(scope.columns)) {
    if (colName in scopedResult) {
      merged[colName] = scopedResult[colName];
    }
  }
  return merged;
}

/**
 * Plugin service provides a convenient API for executing plugin hooks.
 * Wraps the WorkerExecutor with methods that match CRUD handler needs.
 */
export class PluginService {
  private registry: PluginRegistry;
  private executor: WorkerExecutor;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(registry: PluginRegistry, onError?: PluginErrorHandler) {
    this.registry = registry;
    this.executor = new WorkerExecutor(onError);
  }

  /**
   * Ensure plugins are initialized (lazy, thread-safe).
   * Called automatically by hook methods - no need to call manually.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // Use a shared promise to avoid multiple concurrent initializations
    // Clear on failure to allow retry (transient errors like network issues)
    if (!this.initPromise) {
      this.initPromise = this.doInitialize().catch((error) => {
        this.initPromise = null; // Allow retry on next call
        throw error;
      });
    }
    await this.initPromise;
  }

  /**
   * Actually perform initialization
   */
  private async doInitialize(): Promise<void> {
    const plugins = this.registry.getAll();
    for (const plugin of plugins) {
      await this.executor.initPlugin(plugin);
    }
    this.initialized = true;
  }

  /**
   * Initialize all plugins (start Workers).
   * Called automatically when first hook is executed.
   * Can be called explicitly for eager initialization.
   */
  async initialize(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Check if there are any plugins registered
   */
  hasPlugins(): boolean {
    return this.registry.getAll().length > 0;
  }

  /**
   * Apply filter function to registered plugins.
   * Returns plugins that should receive the hook.
   */
  private applyFilter(
    plugins: RegisteredPlugin[],
    hookType: HookType,
    table: string,
    action: CrudAction,
    user?: { sub: string; role?: string },
  ): RegisteredPlugin[] {
    const filterCtx: FilterContext = { hookType, table, action, user };

    return plugins.filter((registered) => {
      const filter = registered.plugin.filter;
      // No filter = schema-driven (handled by caller checking scope)
      if (filter === undefined) return true;
      // 'dangerously-open' = include all
      if (filter === 'dangerously-open') return true;
      // Apply filter function
      return filter(filterCtx);
    });
  }

  /**
   * Execute beforeSave transform for all plugins.
   * Called before insert/update operations.
   *
   * With schema-driven scoping (tableInfo provided):
   * - Only calls plugins for tables/columns that declare them
   * - Passes scoped data (only declared columns)
   * - Merges results back safely
   *
   * @param table - Table name
   * @param action - 'create' or 'update'
   * @param data - Record data to transform
   * @param user - Authenticated user info
   * @param tableInfo - Introspected table for schema-driven scoping
   * @returns Transformed data
   */
  async beforeSave(
    table: string,
    action: 'create' | 'update',
    data: Record<string, unknown>,
    user?: { sub: string; role?: string },
    tableInfo?: IntrospectedTable,
  ): Promise<Record<string, unknown>> {
    const allPlugins = this.registry.getPluginsWithTransform('beforeSave');
    if (allPlugins.length === 0) return data;

    // Apply plugin filters
    const plugins = this.applyFilter(
      allPlugins,
      'transform:beforeSave',
      table,
      action,
      user,
    );
    if (plugins.length === 0) return data;

    await this.ensureInitialized();

    let result = data;

    // Process each plugin with scoping
    for (const registered of plugins) {
      const { plugin } = registered;

      // Extract schema-driven scope for this plugin
      const scope = extractPluginScope(tableInfo, plugin.name);

      // Skip if schema-driven mode and no declarations (unless filter is dangerously-open)
      if (tableInfo && !scope && plugin.filter !== 'dangerously-open') {
        continue;
      }

      // Build context with column configs
      const ctx: PluginContext = {
        table,
        action,
        user,
        columns: scope?.columns,
      };

      // Scope data if schema-driven
      const inputData = scope ? scopeData(result, scope) : result;

      // Execute single plugin
      const pluginResult = await this.executor.executeBeforeSave(
        [registered],
        ctx,
        inputData as Record<string, Serializable>,
      );

      // Merge result back (scoped or full)
      result = scope
        ? mergeScopedData(result, pluginResult, scope)
        : pluginResult;
    }

    return result;
  }

  /**
   * Execute afterRead transform for all plugins.
   * Called after fetching records from database.
   *
   * With schema-driven scoping (tableInfo provided):
   * - Only calls plugins for tables/columns that declare them
   * - Passes scoped data (only declared columns)
   * - Merges results back safely
   *
   * @param table - Table name
   * @param action - 'read' or 'list'
   * @param data - Record data to transform
   * @param user - Authenticated user info
   * @param tableInfo - Introspected table for schema-driven scoping
   * @returns Transformed data
   */
  async afterRead(
    table: string,
    action: 'read' | 'list',
    data: Record<string, unknown>,
    user?: { sub: string; role?: string },
    tableInfo?: IntrospectedTable,
  ): Promise<Record<string, unknown>> {
    const allPlugins = this.registry.getPluginsWithTransform('afterRead');
    if (allPlugins.length === 0) return data;

    // Apply plugin filters
    const plugins = this.applyFilter(
      allPlugins,
      'transform:afterRead',
      table,
      action,
      user,
    );
    if (plugins.length === 0) return data;

    await this.ensureInitialized();

    let result = data;

    // Process each plugin with scoping
    for (const registered of plugins) {
      const { plugin } = registered;

      // Extract schema-driven scope for this plugin
      const scope = extractPluginScope(tableInfo, plugin.name);

      // Skip if schema-driven mode and no declarations (unless filter is dangerously-open)
      if (tableInfo && !scope && plugin.filter !== 'dangerously-open') {
        continue;
      }

      // Build context with column configs
      const ctx: PluginContext = {
        table,
        action,
        user,
        columns: scope?.columns,
      };

      // Scope data if schema-driven
      const inputData = scope ? scopeData(result, scope) : result;

      // Execute single plugin
      const pluginResult = await this.executor.executeAfterRead(
        [registered],
        ctx,
        inputData as Record<string, Serializable>,
      );

      // Merge result back (scoped or full)
      result = scope
        ? mergeScopedData(result, pluginResult, scope)
        : pluginResult;
    }

    return result;
  }

  /**
   * Execute afterRead transform for multiple records.
   * Convenience method for list operations.
   *
   * @param table - Table name
   * @param records - Array of records to transform
   * @param user - Authenticated user info
   * @param tableInfo - Introspected table for schema-driven scoping
   * @returns Array of transformed records
   */
  async afterReadMany(
    table: string,
    records: Record<string, unknown>[],
    user?: { sub: string; role?: string },
    tableInfo?: IntrospectedTable,
  ): Promise<Record<string, unknown>[]> {
    const plugins = this.registry.getPluginsWithTransform('afterRead');
    if (plugins.length === 0) return records;

    // Transform each record through the pipeline
    const results: Record<string, unknown>[] = [];
    for (const record of records) {
      const transformed = await this.afterRead(
        table,
        'list',
        record,
        user,
        tableInfo,
      );
      results.push(transformed);
    }
    return results;
  }

  /**
   * Execute action hooks after a CRUD operation completes.
   * Respects fireAndForget settings per plugin.
   *
   * With schema-driven scoping (tableInfo provided):
   * - Only calls plugins for tables that declare them
   * - Passes scoped data (only declared columns)
   *
   * @param table - Table name
   * @param action - CRUD action
   * @param recordId - Primary key of affected record
   * @param user - Authenticated user info
   * @param oldData - Previous record state (for update/delete)
   * @param newData - New record state (for create/update)
   * @param tableInfo - Introspected table for schema-driven scoping
   */
  async onAction(
    table: string,
    action: CrudAction,
    recordId: string | number | undefined,
    user?: { sub: string; role?: string },
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
    tableInfo?: IntrospectedTable,
  ): Promise<void> {
    const allPlugins = this.registry.getPluginsWithAction(action);
    if (allPlugins.length === 0) return;

    // Apply plugin filters
    const plugins = this.applyFilter(allPlugins, 'action', table, action, user);
    if (plugins.length === 0) return;

    await this.ensureInitialized();

    // Process each plugin with scoping
    for (const registered of plugins) {
      const { plugin } = registered;

      // Extract schema-driven scope for this plugin
      const scope = extractPluginScope(tableInfo, plugin.name);

      // Skip if schema-driven mode and no declarations (unless filter is dangerously-open)
      if (tableInfo && !scope && plugin.filter !== 'dangerously-open') {
        continue;
      }

      // Scope data if schema-driven
      const scopedOldData = scope && oldData
        ? scopeData(oldData, scope)
        : oldData;
      const scopedNewData = scope && newData
        ? scopeData(newData, scope)
        : newData;

      const ctx: ActionContext = {
        table,
        action,
        user,
        recordId,
        oldData: scopedOldData as Serializable | undefined,
        newData: scopedNewData as Serializable | undefined,
        timestamp: new Date().toISOString(),
        columns: scope?.columns,
      };

      await this.executor.executeAction([registered], action, ctx);
    }
  }

  /**
   * Execute UI renderField hook for all plugins.
   * Called when rendering any view (list, detail, edit, create).
   * Returns first non-null override, or null for default rendering.
   *
   * @returns Field UI override or null
   */
  async renderField(
    ctx: UIRenderFieldContext,
  ): Promise<FieldUIOverride> {
    const allPlugins = this.registry.getPluginsWithUI('renderField');
    if (allPlugins.length === 0) return null;

    // Apply plugin filters
    // Use 'create' action only for create view, 'read' for all others (edit, detail, list)
    const plugins = this.applyFilter(
      allPlugins,
      'ui:renderField',
      ctx.table,
      ctx.view === 'create' ? 'create' : 'read',
      ctx.user,
    );
    if (plugins.length === 0) return null;

    await this.ensureInitialized();

    return await this.executor.executeRenderField(plugins, ctx);
  }

  /**
   * Execute the resolveFlashes UI hook for all plugins.
   * Each plugin receives the current flashes list and returns a new array
   * (may add, remove, replace, or pass through).
   *
   * Plugins are run in registration order; the output of one plugin is
   * the input to the next.  Both in-process and Worker plugins are
   * supported — Worker plugins incur a postMessage round-trip per request,
   * so prefer in-process for cheap banner logic.
   *
   * @returns Final array of flash messages to render
   */
  async resolveFlashes(
    ctx: ResolveFlashesContext,
  ): Promise<FlashMessage[]> {
    const allPlugins = this.registry.getPluginsWithUI('resolveFlashes');
    if (allPlugins.length === 0) return ctx.flashes;

    // Apply plugin filters
    const tableForFilter = ctx.table ?? '__cms_dashboard__';
    const actionForFilter: CrudAction = ctx.action === 'dashboard'
      ? 'list'
      : ctx.action;
    const plugins = this.applyFilter(
      allPlugins,
      'ui:resolveFlashes',
      tableForFilter,
      actionForFilter,
      ctx.user,
    );
    if (plugins.length === 0) return ctx.flashes;

    // Lazily initialize Workers only when at least one Worker plugin is in
    // the active set.  Page renders without Worker flash plugins should not
    // pay the init cost.
    if (plugins.some((p) => p.isWorker)) {
      await this.ensureInitialized();
    }

    return await this.executor.executeResolveFlashes(plugins, ctx);
  }

  /**
   * Execute a plugin route render in Worker.
   * Called when a plugin route with `render` is matched.
   *
   * @param pluginName - Name of the plugin that owns the route
   * @param renderType - Message type to send to Worker (from route.render)
   * @param context - Route context with record data, user info, etc.
   * @returns HTML string from Worker
   */
  async executeRouteRender(
    pluginName: string,
    renderType: string,
    context: import('./types.ts').PluginRouteContext,
  ): Promise<string> {
    await this.ensureInitialized();
    return await this.executor.executeRouteRender(
      pluginName,
      renderType,
      context,
    );
  }

  /**
   * Terminate all plugin Workers.
   * Call this during graceful shutdown.
   */
  terminate(): void {
    this.executor.terminate();
    this.initialized = false;
  }
}

/**
 * Create a plugin service from a registry.
 * Returns null if no plugins are configured.
 *
 * @param registry - Plugin registry (or undefined)
 * @param onError - Optional error handler for plugin failures
 */
export function createPluginService(
  registry: PluginRegistry | undefined,
  onError?: PluginErrorHandler,
): PluginService | null {
  if (!registry || registry.getAll().length === 0) {
    return null;
  }
  return new PluginService(registry, onError);
}
