// @drizzle-cms/handlers-workers
// Worker sandbox execution for CMS plugins
// Compatible with Deno and Node.js 20+

// ─────────────────────────────────────────────────────────────
// Types - Re-export plugin types needed for Workers
// ─────────────────────────────────────────────────────────────
export type {
  Serializable,
  SerializableValue,
  SerializableObject,
  PluginContext,
  ActionContext,
  PluginHooks,
  TransformHooks,
  ActionHooks,
  TransformFn,
  ActionHook,
  ActionHookConfig,
  ActionHandlerFn,
  PluginRequest,
  PluginResponse,
  PluginRoute,
  SandboxMode,
  CrudAction,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Worker Executor - Manages plugin Workers
// ─────────────────────────────────────────────────────────────
export { WorkerExecutor, createWorkerExecutor } from './executor.ts';
export type { RegisteredPlugin, WorkerPluginOptions } from './executor.ts';
