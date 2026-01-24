// Worker isolation guard
// Ensures exported worker functions only run in appropriate contexts

// Declare types for cross-runtime compatibility
declare const Deno:
  | { test?: (name: string, fn: () => void) => void }
  | undefined;
declare const process: { env?: Record<string, string | undefined> } | undefined;
declare const WorkerGlobalScope: { new (): unknown } | undefined;

/**
 * Detects if code is running inside a Web Worker.
 */
function isWorkerThread(): boolean {
  // Check for WorkerGlobalScope (standard Web Workers API)
  // This works in Deno, browsers, and Node.js worker_threads with Web Worker API
  if (typeof WorkerGlobalScope === 'undefined') {
    return false;
  }
  return globalThis instanceof WorkerGlobalScope;
}

/**
 * Detects if code is running in a test environment.
 */
function isTestEnvironment(): boolean {
  // Deno test runner
  if (typeof Deno !== 'undefined' && typeof Deno.test === 'function') {
    return true;
  }

  // Node.js with common test runners (vitest, jest, mocha)
  if (typeof process !== 'undefined' && process?.env) {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.VITEST) return true;
    if (process.env.JEST_WORKER_ID) return true;
  }

  return false;
}

/**
 * Runtime guard for worker-exported functions.
 *
 * Call this at the start of any function exported from a worker module.
 * It ensures the function only runs inside a Worker thread or during tests.
 *
 * This makes it easy to audit third-party plugins:
 * - Every exported function should start with `assertWorkerContext()`
 * - If missing, the plugin may be unsafe to use
 *
 * @example
 * ```typescript
 * // In a worker module
 * export function processData(data: Data): Data {
 *   assertWorkerContext();
 *   // ... implementation
 * }
 * ```
 *
 * @throws {Error} If called outside a Worker thread and not in a test
 */
export function assertWorkerContext(): void {
  if (isWorkerThread() || isTestEnvironment()) {
    return;
  }

  throw new Error(
    'This function can only be called inside a Worker thread. ' +
      'If you are a plugin author, ensure your worker module is loaded via `new Worker()`. ' +
      'If you are testing, run your tests with a test runner (deno test, vitest, jest).',
  );
}

/**
 * Check if current context allows worker function execution.
 * Use this for conditional logic instead of throwing.
 *
 * @returns true if in Worker thread or test environment
 */
export function isWorkerContext(): boolean {
  return isWorkerThread() || isTestEnvironment();
}
