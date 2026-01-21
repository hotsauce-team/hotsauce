// Worker-based plugin isolation types

import type { Plugin, PluginHooks } from '@drizzle-cms/handlers';

/**
 * Deno-specific worker permissions
 */
export interface DenoPermissions {
  /** File read permissions */
  read?: boolean | string[];
  /** File write permissions */
  write?: boolean | string[];
  /** Network access permissions */
  net?: boolean | string[];
  /** Environment variable access */
  env?: boolean | string[];
  /** Subprocess execution */
  run?: boolean | string[];
  /** Foreign function interface */
  ffi?: boolean | string[];
  /** High-resolution time */
  hrtime?: boolean;
}

/**
 * Options for creating a worker-isolated plugin
 */
export interface WorkerPluginOptions {
  /** The plugin to run in isolation */
  plugin: Plugin;
  /** URL to the worker entry file */
  workerUrl: URL | string;
  /** Deno-specific permissions (ignored in Node.js) */
  permissions?: DenoPermissions;
  /** Timeout for hook execution in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Message sent from main process to worker
 */
export interface WorkerMessage {
  /** Unique message ID for response correlation */
  id: string;
  /** Hook name to execute */
  hook: keyof PluginHooks;
  /** Context data (serialized) */
  context: unknown;
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
