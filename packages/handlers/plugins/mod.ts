// Plugin system main entry point

export type {
  // Core types
  Serializable,
  Plugin,
  PluginConfig,
  RemotePluginConfig,
  PluginHooks,
  PluginRoute,
  PluginCapabilities,
  PluginsOptions,
  SandboxMode,
  // Transform types
  TransformFn,
  TransformHooks,
  // Action types
  ActionHandlerFn,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  // Context types
  PluginContext,
  ActionContext,
  PluginRequest,
  PluginResponse,
} from './types.ts';

export { isRemotePlugin } from './types.ts';

export {
  PluginRegistry,
  PluginValidationError,
  createPluginRegistry,
  type RegisteredPlugin,
} from './registry.ts';

export {
  WorkerExecutor,
  createWorkerExecutor,
} from './executor.ts';

export {
  PluginService,
  createPluginService,
} from './service.ts';
