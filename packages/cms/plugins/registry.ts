// Plugin registry - manages plugin registration and lookup

import type {
  ActionHooks,
  InProcessPluginConfig,
  PluginConfig,
  PluginRoute,
  TransformHooks,
  UIHooks,
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
   * Get all plugin configurations (without registration metadata)
   */
  getPluginConfigs(): PluginConfig[] {
    return this.getAll().map((rp) => rp.plugin);
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
   * Get all plugins that have UI hooks.
   * Worker plugins MUST explicitly declare UI hooks (no runtime discovery).
   * This prevents sending ui:renderField messages to Workers that don't handle them.
   */
  getPluginsWithUI(hook: keyof UIHooks): RegisteredPlugin[] {
    return this.getAll().filter((p) => {
      // Worker plugins: require explicit UI hook declaration
      if (p.isWorker) {
        const workerConfig = p.plugin as WorkerPluginConfig;
        // UI hooks require explicit declaration - no "include all" fallback
        // (unlike transform/action hooks which have runtime discovery)
        if (!workerConfig.hooks?.ui) return false;
        return workerConfig.hooks.ui.includes(hook);
      }

      // In-process plugins: check for actual function
      const inProcessConfig = p.plugin as InProcessPluginConfig;
      return inProcessConfig.hooks?.ui?.[hook] !== undefined;
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

    // Validate filter type if provided
    // (schema-driven scoping is default when filter is omitted for hooks)
    if (
      plugin.filter !== undefined &&
      plugin.filter !== 'dangerously-open' &&
      typeof plugin.filter !== 'function'
    ) {
      throw new PluginValidationError(
        plugin.name,
        "filter must be a function or 'dangerously-open'",
      );
    }

    // SECURITY: Plugins with routes MUST have an explicit filter
    // Routes accept URL params (e.g., :table/:id) which could expose all tables.
    // Schema-driven scoping only applies to hooks (data flow), not routes (URL access).
    if (
      plugin.routes && plugin.routes.length > 0 && plugin.filter === undefined
    ) {
      throw new PluginValidationError(
        plugin.name,
        "Plugins with routes must specify a 'filter' function or 'dangerously-open'. " +
          'Routes can be accessed for any table via URL params - filter controls which tables are allowed.',
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

      // Check UI hooks are arrays, not objects
      if (plugin.hooks.ui !== undefined) {
        if (!Array.isArray(plugin.hooks.ui)) {
          throw new PluginValidationError(
            plugin.name,
            'Worker plugins must use declarative hooks (arrays), not functions. Use { ui: ["renderField"] } instead of { ui: { renderField: fn } }',
          );
        }
        // Validate each entry is a valid UI hook name
        const validUIHooks = ['renderField', 'resolveFlashes'];
        for (const hook of plugin.hooks.ui) {
          if (!validUIHooks.includes(hook)) {
            throw new PluginValidationError(
              plugin.name,
              `Invalid UI hook "${hook}". Valid hooks: ${
                validUIHooks.join(', ')
              }`,
            );
          }
        }
      }
    }

    // Worker plugins cannot have routes (they'd need main-thread access)
    if (plugin.routes !== undefined) {
      // Worker plugins CAN have routes, but only with `render` (not `handler`)
      for (const route of plugin.routes) {
        this.validateWorkerRoute(plugin.name, route);
      }
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
              `Action hook "${actionName}" must be a function or { handler, blocking? } object`,
            );
          }
        }
      }

      // Check UI hooks are functions
      if (plugin.hooks.ui !== undefined) {
        if (
          typeof plugin.hooks.ui !== 'object' || Array.isArray(plugin.hooks.ui)
        ) {
          throw new PluginValidationError(
            plugin.name,
            'In-process plugins must use function hooks, not declarative arrays',
          );
        }
        for (const [hookName, fn] of Object.entries(plugin.hooks.ui)) {
          if (typeof fn !== 'function') {
            throw new PluginValidationError(
              plugin.name,
              `UI hook "${hookName}" must be a function`,
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
    // Pattern is required
    if (!route.pattern || typeof route.pattern !== 'string') {
      throw new PluginValidationError(
        pluginName,
        'Route must have a pattern string',
      );
    }

    // Methods must be valid (if provided)
    if (route.methods) {
      const validMethods = ['GET', 'POST'];
      for (const method of route.methods) {
        if (!validMethods.includes(method)) {
          throw new PluginValidationError(
            pluginName,
            `Invalid route method "${method}". Valid methods: ${
              validMethods.join(', ')
            }`,
          );
        }
      }
    }

    // Must have exactly one of handler or render
    if (route.handler && route.render) {
      throw new PluginValidationError(
        pluginName,
        `Route "${route.pattern}" cannot have both handler and render`,
      );
    }
    if (!route.handler && !route.render) {
      throw new PluginValidationError(
        pluginName,
        `Route "${route.pattern}" must have either handler or render`,
      );
    }

    // In-process plugin routes must use handler
    if (route.handler && typeof route.handler !== 'function') {
      throw new PluginValidationError(
        pluginName,
        `Route "${route.pattern}" handler must be a function`,
      );
    }

    this.validateMaxBodySize(pluginName, route);

    // Worker routes are validated separately
  }

  /**
   * Validate a route's optional maxBodySize (must be a positive finite number)
   */
  private validateMaxBodySize(pluginName: string, route: PluginRoute): void {
    if (route.maxBodySize === undefined) return;
    if (
      typeof route.maxBodySize !== 'number' ||
      !Number.isFinite(route.maxBodySize) ||
      route.maxBodySize <= 0
    ) {
      throw new PluginValidationError(
        pluginName,
        `Route "${route.pattern}" maxBodySize must be a positive finite number`,
      );
    }
  }

  /**
   * Validate a Worker plugin route (must use render, not handler)
   */
  private validateWorkerRoute(pluginName: string, route: PluginRoute): void {
    // Pattern is required
    if (!route.pattern || typeof route.pattern !== 'string') {
      throw new PluginValidationError(
        pluginName,
        'Route must have a pattern string',
      );
    }

    // Methods must be valid (if provided)
    if (route.methods) {
      const validMethods = ['GET', 'POST'];
      for (const method of route.methods) {
        if (!validMethods.includes(method)) {
          throw new PluginValidationError(
            pluginName,
            `Invalid route method "${method}". Valid methods: ${
              validMethods.join(', ')
            }`,
          );
        }
      }
    }

    // Worker routes MUST use render, not handler
    if (route.handler) {
      throw new PluginValidationError(
        pluginName,
        `Worker plugin route "${route.pattern}" cannot use handler. Use render instead (message type for Worker).`,
      );
    }

    if (!route.render || typeof route.render !== 'string') {
      throw new PluginValidationError(
        pluginName,
        `Worker plugin route "${route.pattern}" must have a render string (message type for Worker)`,
      );
    }

    this.validateMaxBodySize(pluginName, route);
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
