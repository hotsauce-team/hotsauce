// @drizzle-cms/handlers-workers
// Worker sandbox execution for CMS plugins
// Compatible with Deno and Node.js 20+

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
  RegisteredPlugin,
  WorkerHookDeclaration,
} from './executor.ts';
