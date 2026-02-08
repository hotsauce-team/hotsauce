// Plugin service - higher-level API for executing plugin hooks
// Used by CRUD handlers to invoke plugins at the right points

import type { CrudAction } from '../types.ts';
import type {
  ActionContext,
  FieldUIOverride,
  FilterContext,
  HookType,
  PluginContext,
  Serializable,
  UIRenderFieldContext,
} from './types.ts';
import type { PluginRegistry, RegisteredPlugin } from './registry.ts';
import { WorkerExecutor } from '@hotsauce/workers';
import type { PluginErrorHandler } from '@hotsauce/workers';

// Re-export for convenience
export type { PluginErrorHandler } from '@hotsauce/workers';

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
   * @returns Transformed data
   */
  async beforeSave(
    table: string,
    action: 'create' | 'update',
    data: Record<string, unknown>,
    user?: { sub: string; role?: string },
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

    const ctx: PluginContext = {
      table,
      action,
      user,
    };

    return await this.executor.executeBeforeSave(
      plugins,
      ctx,
      data as Record<string, Serializable>,
    );
  }

  /**
   * Execute afterRead transform for all plugins.
   * Called after fetching records from database.
   *
   * @returns Transformed data
   */
  async afterRead(
    table: string,
    action: 'read' | 'list',
    data: Record<string, unknown>,
    user?: { sub: string; role?: string },
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

    const ctx: PluginContext = {
      table,
      action,
      user,
    };

    return await this.executor.executeAfterRead(
      plugins,
      ctx,
      data as Record<string, Serializable>,
    );
  }

  /**
   * Execute afterRead transform for multiple records.
   * Convenience method for list operations.
   *
   * @returns Array of transformed records
   */
  async afterReadMany(
    table: string,
    records: Record<string, unknown>[],
    user?: { sub: string; role?: string },
  ): Promise<Record<string, unknown>[]> {
    const plugins = this.registry.getPluginsWithTransform('afterRead');
    if (plugins.length === 0) return records;

    // Transform each record through the pipeline
    const results: Record<string, unknown>[] = [];
    for (const record of records) {
      const transformed = await this.afterRead(table, 'list', record, user);
      results.push(transformed);
    }
    return results;
  }

  /**
   * Execute action hooks after a CRUD operation completes.
   * Respects fireAndForget settings per plugin.
   */
  async onAction(
    table: string,
    action: CrudAction,
    recordId: string | number | undefined,
    user?: { sub: string; role?: string },
    oldData?: Record<string, unknown>,
    newData?: Record<string, unknown>,
  ): Promise<void> {
    const allPlugins = this.registry.getPluginsWithAction(action);
    if (allPlugins.length === 0) return;

    // Apply plugin filters
    const plugins = this.applyFilter(allPlugins, 'action', table, action, user);
    if (plugins.length === 0) return;

    await this.ensureInitialized();

    const ctx: ActionContext = {
      table,
      action,
      user,
      recordId,
      oldData: oldData as Serializable | undefined,
      newData: newData as Serializable | undefined,
      timestamp: new Date().toISOString(),
    };

    await this.executor.executeAction(plugins, action, ctx);
  }

  /**
   * Execute UI renderField hook for all plugins.
   * Called when rendering edit/create forms.
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
    // Use 'read' action for UI hooks since we're rendering a view
    const plugins = this.applyFilter(
      allPlugins,
      'ui:renderField',
      ctx.table,
      ctx.view === 'edit' ? 'read' : 'create',
      ctx.user,
    );
    if (plugins.length === 0) return null;

    await this.ensureInitialized();

    return await this.executor.executeRenderField(plugins, ctx);
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
