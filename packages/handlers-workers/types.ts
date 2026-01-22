// Worker-based plugin isolation types

import type { PluginHooks, PluginContext } from '@drizzle-cms/handlers';

/**
 * Context passed to allow function
 */
export interface FilterContext extends PluginContext {
  /** Hook being executed */
  hook: keyof PluginHooks;
  /** Record data (for before/after hooks) */
  data?: Record<string, unknown>;
  /** Record (for after hooks) */
  record?: Record<string, unknown>;
  /** Record ID (for read/delete hooks) */
  recordId?: string;
  /** Records list (for afterList hook) */
  records?: Record<string, unknown>[];
}

/**
 * Options for creating a worker-isolated plugin
 */
export interface WorkerPluginOptions<TConfig = unknown> {
  /** Plugin configuration to pass to worker */
  config?: TConfig;
  /** Allow function to selectively execute hooks (default: deny all) */
  allow?: (ctx: FilterContext) => boolean;
  /** Timeout for hook execution in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Message sent from main process to worker
 */
export interface WorkerMessage<TConfig = unknown> {
  /** Unique message ID for response correlation */
  id: string;
  /** Hook name to execute */
  hook: keyof PluginHooks;
  /** Context data (serialized) */
  context: unknown;
  /** Plugin configuration */
  config?: TConfig;
}

/**
 * Response sent from worker to main process
 */
export interface WorkerResponse {
  /** Message ID this response corresponds to */
  id: string;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Optional return value (for future use) */
  result?: unknown;
}

/**
 * Detected runtime environment
 */
export type Runtime = 'deno' | 'node' | 'unknown';
