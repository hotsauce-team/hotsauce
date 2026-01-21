// Runtime detection utilities

import type { Runtime } from './types.ts';

/**
 * Detect the current JavaScript runtime
 */
export function detectRuntime(): Runtime {
  // Check for Deno
  // @ts-ignore - Deno global may not exist
  if (typeof Deno !== 'undefined' && typeof Deno.version !== 'undefined') {
    return 'deno';
  }
  
  // Check for Node.js
  // @ts-ignore - process global may not exist
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'node';
  }
  
  return 'unknown';
}

/**
 * Get the runtime name for error messages
 */
export function getRuntimeName(runtime: Runtime): string {
  switch (runtime) {
    case 'deno':
      return 'Deno';
    case 'node':
      return 'Node.js';
    default:
      return 'Unknown runtime';
  }
}
