// Worker script - runs inside the Worker sandbox
// This file is loaded by the Worker and executes plugin code in isolation

import type {
  Plugin,
  PluginContext,
  ActionContext,
  PluginRequest,
  PluginResponse,
  Serializable,
  PluginHooks,
  PluginRoute,
} from '../types.ts';

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

let pluginInstance: Plugin | null = null;
let pluginConfig: Serializable | null = null;
let pluginHooks: PluginHooks | null = null;
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

      case 'hook:beforeSave':
        result = await handleBeforeSave(
          payload as { ctx: PluginContext; data: Record<string, Serializable> }
        );
        break;

      case 'hook:afterRead':
        result = await handleAfterRead(
          payload as { ctx: PluginContext; data: Record<string, Serializable> }
        );
        break;

      case 'hook:onAction':
        await handleOnAction(payload as { ctx: ActionContext });
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
  // The actual plugin code needs to be imported/loaded here
  // For now, we store the serialized plugin info
  // In a real implementation, the plugin source would be loaded
  
  pluginConfig = payload.config;

  // Plugin is initialized - hooks and routes should be set by
  // the actual plugin module that imports this worker script
  
  return { initialized: true };
}

/**
 * Execute beforeSave hook
 */
async function handleBeforeSave(payload: {
  ctx: PluginContext;
  data: Record<string, Serializable>;
}): Promise<Record<string, Serializable>> {
  if (!pluginHooks?.beforeSave) {
    return payload.data;
  }

  return await pluginHooks.beforeSave(payload.ctx, payload.data);
}

/**
 * Execute afterRead hook
 */
async function handleAfterRead(payload: {
  ctx: PluginContext;
  data: Record<string, Serializable>;
}): Promise<Record<string, Serializable>> {
  if (!pluginHooks?.afterRead) {
    return payload.data;
  }

  return await pluginHooks.afterRead(payload.ctx, payload.data);
}

/**
 * Execute onAction hook
 */
async function handleOnAction(payload: { ctx: ActionContext }): Promise<void> {
  if (!pluginHooks?.onAction) {
    return;
  }

  await pluginHooks.onAction(payload.ctx);
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
  pluginHooks = hooks;
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
