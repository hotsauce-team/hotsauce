// Plugin registry - manages plugin registration and lookup

import type {
  ActionHooks,
  PluginConfig,
  PluginRoute,
  TransformHooks,
} from './types.ts';

/**
 * Validation error for plugin configuration
 */
export class PluginValidationError extends Error {
  constructor(
    public pluginName: string,
    message: string,
  ) {
    super(`Plugin "${pluginName}": ${message}`);
    this.name = 'PluginValidationError';
  }
}

/**
 * Registered plugin with resolved configuration
 */
export interface RegisteredPlugin {
  /** Plugin configuration */
  plugin: PluginConfig;
  /** Whether the plugin has been initialized */
  initialized: boolean;
  /** Whether this plugin runs in a Worker */
  isWorker: boolean;
}

/**
 * Plugin registry - holds all registered plugins and provides lookup
 */
export class PluginRegistry {
  private plugins: Map<string, RegisteredPlugin> = new Map();

  /**
   * Register a plugin with the registry
   */
  register(pluginConfig: PluginConfig): void {
    const { name, worker } = pluginConfig;

    // Validate plugin
    this.validatePlugin(pluginConfig);

    // Check for duplicates
    if (this.plugins.has(name)) {
      throw new PluginValidationError(
        name,
        'A plugin with this name is already registered',
      );
    }

    this.plugins.set(name, {
      plugin: pluginConfig,
      initialized: false,
      isWorker: worker !== undefined,
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
   * Get all plugins that have transform hooks
   * Worker plugins without hooks declared are included (hooks discovered at runtime)
   */
  getPluginsWithTransform(hook: keyof TransformHooks): RegisteredPlugin[] {
    return this.getAll().filter((p) => {
      // If hooks are declared, check for this specific hook
      if (p.plugin.hooks?.transform?.[hook] !== undefined) return true;
      // Worker plugins without hooks declared get all messages (runtime filtering)
      if (p.isWorker && !p.plugin.hooks) return true;
      return false;
    });
  }

  /**
   * Get all plugins that have action hooks for a specific action
   * Worker plugins without hooks declared are included (hooks discovered at runtime)
   */
  getPluginsWithAction(action: keyof ActionHooks): RegisteredPlugin[] {
    return this.getAll().filter((p) => {
      // If hooks are declared, check for this specific hook
      if (p.plugin.hooks?.on?.[action] !== undefined) return true;
      // Worker plugins without hooks declared get all messages (runtime filtering)
      if (p.isWorker && !p.plugin.hooks) return true;
      return false;
    });
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
   * Validate a plugin definition
   */
  private validatePlugin(plugin: PluginConfig): void {
    // Name is required
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new PluginValidationError(
        plugin.name ?? '<unnamed>',
        'Plugin must have a valid name',
      );
    }

    // Name must be a valid identifier
    if (!/^[a-z][a-z0-9-]*$/i.test(plugin.name)) {
      throw new PluginValidationError(
        plugin.name,
        'Plugin name must start with a letter and contain only letters, numbers, and hyphens',
      );
    }

    // Validate routes
    if (plugin.routes) {
      for (const route of plugin.routes) {
        this.validateRoute(plugin.name, route);
      }
    }

    // Validate capabilities match actual hooks
    this.validateCapabilities(plugin);
  }

  /**
   * Validate that declared capabilities match actual hooks
   */
  private validateCapabilities(plugin: PluginConfig): void {
    const capabilities = plugin.capabilities;
    if (!capabilities) return;

    // Validate transforms
    if (capabilities.transforms) {
      const declaredTransforms = new Set(capabilities.transforms);
      const actualTransforms = plugin.hooks?.transform
        ? Object.keys(plugin.hooks.transform) as (keyof TransformHooks)[]
        : [];

      for (const transform of actualTransforms) {
        if (!declaredTransforms.has(transform)) {
          throw new PluginValidationError(
            plugin.name,
            `Plugin uses transform "${transform}" but does not declare it in capabilities.transforms`,
          );
        }
      }
    }

    // Validate actions
    if (capabilities.actions) {
      const declaredActions = new Set(capabilities.actions);
      const actualActions = plugin.hooks?.on
        ? Object.keys(plugin.hooks.on) as (keyof ActionHooks)[]
        : [];

      for (const action of actualActions) {
        if (!declaredActions.has(action)) {
          throw new PluginValidationError(
            plugin.name,
            `Plugin uses action "${action}" but does not declare it in capabilities.actions`,
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
        `Route path must start with /: ${route.path}`,
      );
    }

    // Method must be valid
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!validMethods.includes(route.method)) {
      throw new PluginValidationError(
        pluginName,
        `Invalid route method: ${route.method}`,
      );
    }

    // Handler must be a function
    if (typeof route.handler !== 'function') {
      throw new PluginValidationError(
        pluginName,
        `Route handler must be a function: ${route.path}`,
      );
    }
  }
}

/**
 * Create a plugin registry from configuration
 */
export function createPluginRegistry(
  plugins: PluginConfig[] = [],
): PluginRegistry {
  const registry = new PluginRegistry();
  registry.registerAll(plugins);
  return registry;
}
