// Plugin system main entry point

export type {
  ActionContext,
  // Action types
  ActionHandlerFn,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  FilterContext,
  // Filter types
  HookType,
  PluginCapabilities,
  PluginConfig,
  // Context types
  PluginContext,
  PluginFilter,
  PluginHooks,
  PluginRequest,
  PluginResponse,
  PluginRoute,
  PluginsOptions,
  // Core types
  Serializable,
  // Transform types
  TransformFn,
  TransformHooks,
} from './types.ts';

export { isWorkerPlugin } from './types.ts';

export {
  createPluginRegistry,
  PluginRegistry,
  PluginValidationError,
  type RegisteredPlugin,
} from './registry.ts';

export {
  createWorkerExecutor,
  WorkerExecutor,
} from '@drizzle-cms/handlers-workers';

export { createPluginService, PluginService } from './service.ts';
