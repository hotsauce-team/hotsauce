// Plugin registry - manages plugin registration and lookup

import type {
  ActionHooks,
  InProcessPluginConfig,
  PluginConfig,
  PluginRoute,
  TransformHooks,
  WorkerPluginConfig,
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
      // Worker plugins: check declarative hooks array
      if (p.isWorker) {
        const workerConfig = p.plugin as WorkerPluginConfig;
        // If no hooks declared, include all (runtime filtering via filter)
        if (!workerConfig.hooks) return true;
        // Check declarative transform array
        return workerConfig.hooks.transform?.includes(hook) ?? false;
      }

      // In-process plugins: check for actual function
      const inProcessConfig = p.plugin as InProcessPluginConfig;
      return inProcessConfig.hooks?.transform?.[hook] !== undefined;
    });
  }

  /**
   * Get all plugins that have action hooks for a specific action
   * Worker plugins without hooks declared are included (hooks discovered at runtime)
   */
  getPluginsWithAction(action: keyof ActionHooks): RegisteredPlugin[] {
    return this.getAll().filter((p) => {
      // Worker plugins: check declarative hooks array
      if (p.isWorker) {
        const workerConfig = p.plugin as WorkerPluginConfig;
        // If no hooks declared, include all (runtime filtering via filter)
        if (!workerConfig.hooks) return true;
        // Check declarative action array
        return workerConfig.hooks.on?.includes(action) ?? false;
      }

      // In-process plugins: check for actual function
      const inProcessConfig = p.plugin as InProcessPluginConfig;
      return inProcessConfig.hooks?.on?.[action] !== undefined;
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

    // Filter is required (security: controls data flow to plugins)
    if (plugin.filter === undefined) {
      throw new PluginValidationError(
        plugin.name,
        "filter is required. Use a function to control data flow, or 'dangerously-open' to allow all data.",
      );
    }

    // Validate filter type
    if (
      plugin.filter !== 'dangerously-open' &&
      typeof plugin.filter !== 'function'
    ) {
      throw new PluginValidationError(
        plugin.name,
        "filter must be a function or 'dangerously-open'",
      );
    }

    // Validate Worker vs in-process specific rules
    if (plugin.worker !== undefined) {
      this.validateWorkerPlugin(plugin as WorkerPluginConfig);
    } else {
      this.validateInProcessPlugin(plugin as InProcessPluginConfig);
    }

    // Validate capabilities match actual hooks
    this.validateCapabilities(plugin);
  }

  /**
   * Validate Worker plugin configuration
   */
  private validateWorkerPlugin(plugin: WorkerPluginConfig): void {
    // Worker plugins can only have declarative hooks (arrays), not functions
    if (plugin.hooks) {
      // Check transform hooks are arrays, not functions
      if (plugin.hooks.transform !== undefined) {
        if (!Array.isArray(plugin.hooks.transform)) {
          throw new PluginValidationError(
            plugin.name,
            'Worker plugins must use declarative hooks (arrays), not functions. Use { transform: ["beforeSave"] } instead of { transform: { beforeSave: fn } }',
          );
        }
        // Validate each entry is a valid hook name
        const validTransforms = ['beforeSave', 'afterRead'];
        for (const hook of plugin.hooks.transform) {
          if (!validTransforms.includes(hook)) {
            throw new PluginValidationError(
              plugin.name,
              `Invalid transform hook "${hook}". Valid hooks: ${
                validTransforms.join(', ')
              }`,
            );
          }
        }
      }

      // Check action hooks are arrays, not objects
      if (plugin.hooks.on !== undefined) {
        if (!Array.isArray(plugin.hooks.on)) {
          throw new PluginValidationError(
            plugin.name,
            'Worker plugins must use declarative hooks (arrays), not functions. Use { on: ["create"] } instead of { on: { create: fn } }',
          );
        }
        // Validate each entry is a valid action name
        const validActions = ['create', 'update', 'delete', 'read', 'list'];
        for (const action of plugin.hooks.on) {
          if (!validActions.includes(action)) {
            throw new PluginValidationError(
              plugin.name,
              `Invalid action hook "${action}". Valid actions: ${
                validActions.join(', ')
              }`,
            );
          }
        }
      }
    }

    // Worker plugins cannot have routes (they'd need main-thread access)
    if (plugin.routes !== undefined) {
      throw new PluginValidationError(
        plugin.name,
        'Worker plugins cannot have routes. Routes must run in the main thread.',
      );
    }
  }

  /**
   * Validate in-process plugin configuration
   */
  private validateInProcessPlugin(plugin: InProcessPluginConfig): void {
    // In-process hooks must be functions, not arrays
    if (plugin.hooks) {
      // Check transform hooks are functions
      if (plugin.hooks.transform !== undefined) {
        if (
          typeof plugin.hooks.transform !== 'object' ||
          Array.isArray(plugin.hooks.transform)
        ) {
          throw new PluginValidationError(
            plugin.name,
            'In-process plugins must use function hooks, not declarative arrays',
          );
        }
        for (const [hookName, fn] of Object.entries(plugin.hooks.transform)) {
          if (typeof fn !== 'function') {
            throw new PluginValidationError(
              plugin.name,
              `Transform hook "${hookName}" must be a function`,
            );
          }
        }
      }

      // Check action hooks are functions
      if (plugin.hooks.on !== undefined) {
        if (
          typeof plugin.hooks.on !== 'object' || Array.isArray(plugin.hooks.on)
        ) {
          throw new PluginValidationError(
            plugin.name,
            'In-process plugins must use function hooks, not declarative arrays',
          );
        }
        for (
          const [actionName, hookConfig] of Object.entries(plugin.hooks.on)
        ) {
          if (
            typeof hookConfig !== 'function' && typeof hookConfig !== 'object'
          ) {
            throw new PluginValidationError(
              plugin.name,
              `Action hook "${actionName}" must be a function or { handler, fireAndForget } object`,
            );
          }
        }
      }
    }

    // Validate routes
    if (plugin.routes) {
      for (const route of plugin.routes) {
        this.validateRoute(plugin.name, route);
      }
    }
  }

  /**
   * Validate that declared capabilities match actual hooks
   */
  private validateCapabilities(plugin: PluginConfig): void {
    const capabilities = plugin.capabilities;
    if (!capabilities) return;

    const isWorker = plugin.worker !== undefined;

    // Get actual hooks used by the plugin
    let actualTransforms: (keyof TransformHooks)[] = [];
    let actualActions: string[] = [];

    if (isWorker) {
      // Worker plugins: hooks are arrays
      const workerPlugin = plugin as WorkerPluginConfig;
      actualTransforms = workerPlugin.hooks?.transform ?? [];
      actualActions = workerPlugin.hooks?.on ?? [];
    } else {
      // In-process plugins: hooks are objects with functions
      const inProcessPlugin = plugin as InProcessPluginConfig;
      actualTransforms = inProcessPlugin.hooks?.transform
        ? Object.keys(
          inProcessPlugin.hooks.transform,
        ) as (keyof TransformHooks)[]
        : [];
      actualActions = inProcessPlugin.hooks?.on
        ? Object.keys(inProcessPlugin.hooks.on)
        : [];
    }

    // Validate transforms
    if (capabilities.transforms) {
      const declaredTransforms = new Set(capabilities.transforms);
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
      for (const action of actualActions) {
        if (!declaredActions.has(action as keyof ActionHooks)) {
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
 * Create a plugin registry and register the provided plugins.
 *
 * This is a convenience factory that creates a new `PluginRegistry`
 * and registers all plugins in one step.
 *
 * @param plugins - Array of plugin configurations to register
 * @returns A new `PluginRegistry` with all plugins registered
 * @throws {PluginValidationError} If any plugin configuration is invalid
 *
 * @example
 * ```ts
 * const registry = createPluginRegistry([
 *   { name: 'audit-log', worker: auditWorker },
 *   { name: 'custom', hooks: { on: { create: async () => {} } } },
 * ]);
 * ```
 */
export function createPluginRegistry(
  plugins: PluginConfig[] = [],
): PluginRegistry {
  const registry = new PluginRegistry();
  registry.registerAll(plugins);
  return registry;
}
