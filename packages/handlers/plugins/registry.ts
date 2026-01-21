// Plugin registry - manages plugin registration and lookup

import type {
  Plugin,
  PluginConfig,
  PluginHooks,
  PluginRoute,
  SandboxMode,
} from './types.ts';

/**
 * Validation error for plugin configuration
 */
export class PluginValidationError extends Error {
  constructor(
    public pluginName: string,
    message: string
  ) {
    super(`Plugin "${pluginName}": ${message}`);
    this.name = 'PluginValidationError';
  }
}

/**
 * Registered plugin with resolved configuration
 */
export interface RegisteredPlugin {
  /** Plugin definition */
  plugin: Plugin;
  /** Plugin configuration (serializable) */
  config?: unknown;
  /** Whether the plugin has been initialized */
  initialized: boolean;
}

/**
 * Plugin registry - holds all registered plugins and provides lookup
 */
export class PluginRegistry {
  private plugins: Map<string, RegisteredPlugin> = new Map();
  private sandboxMode: SandboxMode;

  constructor(sandboxMode: SandboxMode = 'worker') {
    this.sandboxMode = sandboxMode;
  }

  /**
   * Register a plugin with the registry
   */
  register(pluginConfig: PluginConfig): void {
    const { plugin, config } = pluginConfig;

    // Validate plugin
    this.validatePlugin(plugin);

    // Check for duplicates
    if (this.plugins.has(plugin.name)) {
      throw new PluginValidationError(
        plugin.name,
        'A plugin with this name is already registered'
      );
    }

    this.plugins.set(plugin.name, {
      plugin,
      config,
      initialized: false,
    });
  }

  /**
   * Register multiple plugins
   */
  registerAll(pluginConfigs: PluginConfig[]): void {
    for (const config of pluginConfigs) {
      this.register(config);
    }
  }

  /**
   * Get a registered plugin by name
   */
  get(name: string): RegisteredPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  getAll(): RegisteredPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all plugins that implement a specific hook
   */
  getPluginsWithHook<K extends keyof PluginHooks>(hook: K): RegisteredPlugin[] {
    return this.getAll().filter((p) => p.plugin.hooks?.[hook] !== undefined);
  }

  /**
   * Get all routes from all plugins
   */
  getAllRoutes(): Array<{ pluginName: string; route: PluginRoute }> {
    const routes: Array<{ pluginName: string; route: PluginRoute }> = [];

    for (const { plugin } of this.plugins.values()) {
      if (plugin.routes) {
        for (const route of plugin.routes) {
          routes.push({ pluginName: plugin.name, route });
        }
      }
    }

    return routes;
  }

  /**
   * Get the configured sandbox mode
   */
  getSandboxMode(): SandboxMode {
    return this.sandboxMode;
  }

  /**
   * Check if running in Deno runtime
   */
  isDenoRuntime(): boolean {
    return typeof globalThis.Deno !== 'undefined';
  }

  /**
   * Get effective sandbox mode (falls back to 'worker' if deno-sandbox requested but not on Deno)
   */
  getEffectiveSandboxMode(): SandboxMode {
    if (this.sandboxMode === 'deno-sandbox' && !this.isDenoRuntime()) {
      console.warn(
        'Plugin sandbox mode "deno-sandbox" is only available on Deno runtime. ' +
          'Falling back to "worker" mode.'
      );
      return 'worker';
    }
    return this.sandboxMode;
  }

  /**
   * Validate a plugin definition
   */
  private validatePlugin(plugin: Plugin): void {
    // Name is required
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new PluginValidationError(
        plugin.name ?? '<unnamed>',
        'Plugin must have a valid name'
      );
    }

    // Name must be a valid identifier
    if (!/^[a-z][a-z0-9-]*$/i.test(plugin.name)) {
      throw new PluginValidationError(
        plugin.name,
        'Plugin name must start with a letter and contain only letters, numbers, and hyphens'
      );
    }

    // Validate routes
    if (plugin.routes) {
      for (const route of plugin.routes) {
        this.validateRoute(plugin.name, route);
      }
    }

    // Validate capabilities match actual hooks
    if (plugin.capabilities?.hooks) {
      const declaredHooks = new Set(plugin.capabilities.hooks);
      const actualHooks = plugin.hooks ? Object.keys(plugin.hooks) : [];

      for (const hook of actualHooks) {
        if (!declaredHooks.has(hook as keyof PluginHooks)) {
          throw new PluginValidationError(
            plugin.name,
            `Plugin uses hook "${hook}" but does not declare it in capabilities`
          );
        }
      }
    }
  }

  /**
   * Validate a plugin route
   */
  private validateRoute(pluginName: string, route: PluginRoute): void {
    // Path must start with /
    if (!route.path.startsWith('/')) {
      throw new PluginValidationError(
        pluginName,
        `Route path must start with /: ${route.path}`
      );
    }

    // Method must be valid
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!validMethods.includes(route.method)) {
      throw new PluginValidationError(
        pluginName,
        `Invalid route method: ${route.method}`
      );
    }

    // Handler must be a function
    if (typeof route.handler !== 'function') {
      throw new PluginValidationError(
        pluginName,
        `Route handler must be a function: ${route.path}`
      );
    }
  }
}

/**
 * Create a plugin registry from configuration
 */
export function createPluginRegistry(
  plugins: PluginConfig[] = [],
  sandboxMode: SandboxMode = 'worker'
): PluginRegistry {
  const registry = new PluginRegistry(sandboxMode);
  registry.registerAll(plugins);
  return registry;
}
