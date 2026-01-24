// Worker isolation guard
// Ensures exported worker functions only run in appropriate contexts

/**
 * Global marker that drizzle-cms sets on the main thread.
 * Workers don't inherit this, so its absence indicates Worker context.
 *
 * Plugin authors: use this one-liner at the start of exported functions:
 * ```typescript
 * if (globalThis.__CMS_MAIN_PROCESS__) throw new Error('Worker only');
 * ```
 */
declare global {
  // deno-lint-ignore no-var
  var __CMS_MAIN_PROCESS__: boolean | undefined;
}

/**
 * Check if current context allows worker function execution.
 *
 * Returns `true` if:
 * - Running inside a Worker (main thread marker is absent)
 * - Running in tests (createCmsHandler was never called)
 *
 * @returns `true` if in Worker context or test, `false` if on main CMS thread
 *
 * @example
 * ```typescript
 * if (isWorkerContext()) {
 *   // Safe to run worker code
 * }
 * ```
 */
export function isWorkerContext(): boolean {
  // If the main thread marker is set, we're on the main thread
  // Workers don't inherit globals, so this will be undefined in Workers
  return globalThis.__CMS_MAIN_PROCESS__ !== true;
}

/**
 * Runtime guard for worker-exported functions.
 *
 * Call this at the start of any function exported from a worker module.
 * It ensures the function only runs inside a Worker thread (or during tests
 * where createCmsHandler was never called).
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
 * @throws {Error} If called on the main CMS thread
 */
export function assertWorkerContext(): void {
  if (isWorkerContext()) {
    return;
  }

  throw new Error(
    'This function can only be called inside a Worker thread. ' +
      'If you are a plugin author, ensure your worker module is loaded via `new Worker()`. ' +
      'Direct imports of worker modules on the main thread are not allowed.',
  );
}
