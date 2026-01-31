// @hotsauce/handlers-workers
// Worker sandbox execution for CMS plugins
// Compatible with Deno and Node.js 20+

// ─────────────────────────────────────────────────────────────
// Worker isolation guard - for plugin authors
// ─────────────────────────────────────────────────────────────
export { assertWorkerContext, isWorkerContext } from './guard.ts';

// ─────────────────────────────────────────────────────────────
// Serialization validation - runtime checks for Worker data
// ─────────────────────────────────────────────────────────────
export {
  isSerializable,
  SerializationError,
  validateSerializable,
} from './validate.ts';
export type { ValidationOptions } from './validate.ts';

// ─────────────────────────────────────────────────────────────
// Types - Re-export plugin types needed for Workers
// ─────────────────────────────────────────────────────────────
export type {
  ActionContext,
  ActionHandlerFn,
  ActionHook,
  ActionHookConfig,
  ActionHooks,
  CrudAction,
  PluginContext,
  PluginHooks,
  PluginRequest,
  PluginResponse,
  PluginRoute,
  Serializable,
  SerializableObject,
  SerializableValue,
  TransformFn,
  TransformHooks,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Worker Executor - Manages plugin Workers
// ─────────────────────────────────────────────────────────────
export { createWorkerExecutor, WorkerExecutor } from './executor.ts';
export type {
  PluginConfig as WorkerPluginConfig,
  PluginErrorContext,
  PluginErrorHandler,
  RegisteredPlugin,
  WorkerHookDeclaration,
} from './executor.ts';
