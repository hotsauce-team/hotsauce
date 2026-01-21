// Worker script - runs inside the Worker sandbox
// This file is loaded by the Worker and executes plugin code in isolation

import type {
  PluginContext,
  ActionContext,
  PluginRequest,
  PluginResponse,
  Serializable,
  PluginHooks,
  TransformHooks,
  ActionHooks,
  PluginRoute,
} from '../types.ts';
import type { CrudAction } from '../../types.ts';

// ─────────────────────────────────────────────────────────────
// Message types (duplicated to avoid import issues in Worker)
// ─────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: string;
  type: string;
  payload: Serializable;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: Serializable;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Plugin state (isolated per Worker)
// ─────────────────────────────────────────────────────────────

let pluginConfig: Serializable | null = null;
let transformHooks: TransformHooks | null = null;
let actionHooks: ActionHooks | null = null;
let pluginRoutes: Map<string, PluginRoute> = new Map();

// ─────────────────────────────────────────────────────────────
// Message handler
// ─────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    let result: Serializable = null;

    switch (type) {
      case 'init':
        result = await handleInit(payload as { plugin: Serializable; config: Serializable });
        break;

      case 'transform:beforeSave':
        result = await handleBeforeSave(
          payload as { ctx: PluginContext; data: Record<string, Serializable> }
        );
        break;

      case 'transform:afterRead':
        result = await handleAfterRead(
          payload as { ctx: PluginContext; data: Record<string, Serializable> }
        );
        break;

      case 'action':
        await handleAction(payload as { action: CrudAction; ctx: ActionContext });
        result = null;
        break;

      case 'route':
        result = await handleRoute(
          payload as { path: string; request: PluginRequest }
        );
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    const response: WorkerResponse = { id, success: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

// ─────────────────────────────────────────────────────────────
// Handler functions
// ─────────────────────────────────────────────────────────────

/**
 * Initialize the plugin in this Worker
 */
async function handleInit(payload: {
  plugin: Serializable;
  config: Serializable;
}): Promise<Serializable> {
  // Store plugin config for use by hooks
  pluginConfig = payload.config;

  // Plugin is initialized - hooks and routes should be set by
  // the actual plugin module that imports this worker script
  
  return { initialized: true };
}

/**
 * Execute beforeSave transform
 */
async function handleBeforeSave(payload: {
  ctx: PluginContext;
  data: Record<string, Serializable>;
}): Promise<Record<string, Serializable>> {
  if (!transformHooks?.beforeSave) {
    return payload.data;
  }

  return await transformHooks.beforeSave(payload.ctx, payload.data);
}

/**
 * Execute afterRead transform
 */
async function handleAfterRead(payload: {
  ctx: PluginContext;
  data: Record<string, Serializable>;
}): Promise<Record<string, Serializable>> {
  if (!transformHooks?.afterRead) {
    return payload.data;
  }

  return await transformHooks.afterRead(payload.ctx, payload.data);
}

/**
 * Execute action hook for a specific CRUD action
 */
async function handleAction(payload: { 
  action: CrudAction; 
  ctx: ActionContext;
}): Promise<void> {
  const hook = actionHooks?.[payload.action];
  if (!hook) {
    return;
  }

  // Get the handler function (either direct function or from config object)
  const handler = typeof hook === 'function' ? hook : hook.handler;
  await handler(payload.ctx);
}

/**
 * Execute route handler
 */
async function handleRoute(payload: {
  path: string;
  request: PluginRequest;
}): Promise<PluginResponse> {
  const route = pluginRoutes.get(payload.path);

  if (!route) {
    return { status: 404, body: { error: 'Route not found' } };
  }

  return await route.handler(payload.request);
}

// ─────────────────────────────────────────────────────────────
// Plugin registration API (called by plugin code)
// ─────────────────────────────────────────────────────────────

/**
 * Register plugin hooks (called by plugin module)
 */
export function registerHooks(hooks: PluginHooks): void {
  if (hooks.transform) {
    transformHooks = hooks.transform;
  }
  if (hooks.on) {
    actionHooks = hooks.on;
  }
}

/**
 * Register transform hooks only
 */
export function registerTransforms(transforms: TransformHooks): void {
  transformHooks = transforms;
}

/**
 * Register action hooks only
 */
export function registerActions(actions: ActionHooks): void {
  actionHooks = actions;
}

/**
 * Register plugin routes (called by plugin module)
 */
export function registerRoutes(routes: PluginRoute[]): void {
  for (const route of routes) {
    pluginRoutes.set(route.path, route);
  }
}

/**
 * Get the plugin configuration (passed during init)
 */
export function getPluginConfig<T = Serializable>(): T | null {
  return pluginConfig as T | null;
}
    pluginRoutes.set(route.path, route);
  }
}

/**
 * Get the plugin configuration (passed during init)
 */
export function getPluginConfig<T = Serializable>(): T | null {
  return pluginConfig as T | null;
}
