// Plugin service - higher-level API for executing plugin hooks
// Used by CRUD handlers to invoke plugins at the right points

import type { CrudAction } from '../types.ts';
import type {
  PluginContext,
  ActionContext,
  Serializable,
} from './types.ts';
import type { PluginRegistry } from './registry.ts';
import { WorkerExecutor } from './executor.ts';

/**
 * Plugin service provides a convenient API for executing plugin hooks.
 * Wraps the WorkerExecutor with methods that match CRUD handler needs.
 */
export class PluginService {
  private registry: PluginRegistry;
  private executor: WorkerExecutor;
  private initialized = false;

  constructor(registry: PluginRegistry) {
    this.registry = registry;
    this.executor = new WorkerExecutor(registry.getSandboxMode());
  }

  /**
   * Initialize all plugins (start Workers).
   * Must be called before executing hooks.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const plugins = this.registry.getAll();
    for (const plugin of plugins) {
      await this.executor.initPlugin(plugin);
    }
    this.initialized = true;
  }

  /**
   * Check if there are any plugins registered
   */
  hasPlugins(): boolean {
    return this.registry.getAll().length > 0;
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
    user?: { sub: string; role?: string }
  ): Promise<Record<string, unknown>> {
    const plugins = this.registry.getPluginsWithTransform('beforeSave');
    if (plugins.length === 0) return data;

    const ctx: PluginContext = {
      table,
      action,
      user,
    };

    return await this.executor.executeBeforeSave(
      plugins,
      ctx,
      data as Record<string, Serializable>
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
    user?: { sub: string; role?: string }
  ): Promise<Record<string, unknown>> {
    const plugins = this.registry.getPluginsWithTransform('afterRead');
    if (plugins.length === 0) return data;

    const ctx: PluginContext = {
      table,
      action,
      user,
    };

    return await this.executor.executeAfterRead(
      plugins,
      ctx,
      data as Record<string, Serializable>
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
    user?: { sub: string; role?: string }
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
    newData?: Record<string, unknown>
  ): Promise<void> {
    const plugins = this.registry.getPluginsWithAction(action);
    if (plugins.length === 0) return;

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
 */
export function createPluginService(
  registry: PluginRegistry | undefined
): PluginService | null {
  if (!registry || registry.getAll().length === 0) {
    return null;
  }
  return new PluginService(registry);
}
