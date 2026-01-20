// Plugin execution utilities

import type { Plugin, PluginContext, BeforeContext, AfterContext } from './types.ts';

/**
 * Execute beforeCreate hooks for all plugins
 */
export async function executeBeforeCreate(
  plugins: Plugin[],
  ctx: BeforeContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.beforeCreate) {
      await plugin.hooks.beforeCreate(ctx);
    }
  }
}

/**
 * Execute afterCreate hooks for all plugins
 */
export async function executeAfterCreate(
  plugins: Plugin[],
  ctx: AfterContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.afterCreate) {
      await plugin.hooks.afterCreate(ctx);
    }
  }
}

/**
 * Execute beforeUpdate hooks for all plugins
 */
export async function executeBeforeUpdate(
  plugins: Plugin[],
  ctx: BeforeContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.beforeUpdate) {
      await plugin.hooks.beforeUpdate(ctx);
    }
  }
}

/**
 * Execute afterUpdate hooks for all plugins
 */
export async function executeAfterUpdate(
  plugins: Plugin[],
  ctx: AfterContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.afterUpdate) {
      await plugin.hooks.afterUpdate(ctx);
    }
  }
}

/**
 * Execute beforeDelete hooks for all plugins
 */
export async function executeBeforeDelete(
  plugins: Plugin[],
  ctx: AfterContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.beforeDelete) {
      await plugin.hooks.beforeDelete(ctx);
    }
  }
}

/**
 * Execute afterDelete hooks for all plugins
 */
export async function executeAfterDelete(
  plugins: Plugin[],
  ctx: AfterContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.afterDelete) {
      await plugin.hooks.afterDelete(ctx);
    }
  }
}

/**
 * Execute beforeRead hooks for all plugins
 */
export async function executeBeforeRead(
  plugins: Plugin[],
  ctx: PluginContext & { recordId: string }
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.beforeRead) {
      await plugin.hooks.beforeRead(ctx);
    }
  }
}

/**
 * Execute afterRead hooks for all plugins
 */
export async function executeAfterRead(
  plugins: Plugin[],
  ctx: AfterContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.afterRead) {
      await plugin.hooks.afterRead(ctx);
    }
  }
}

/**
 * Execute beforeList hooks for all plugins
 */
export async function executeBeforeList(
  plugins: Plugin[],
  ctx: PluginContext
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.beforeList) {
      await plugin.hooks.beforeList(ctx);
    }
  }
}

/**
 * Execute afterList hooks for all plugins
 */
export async function executeAfterList(
  plugins: Plugin[],
  ctx: PluginContext & { records: Record<string, unknown>[] }
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.afterList) {
      await plugin.hooks.afterList(ctx);
    }
  }
}
