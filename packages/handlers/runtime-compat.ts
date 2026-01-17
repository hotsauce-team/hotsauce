// Runtime compatibility utilities
// Works in Deno, Node.js 20+, Bun, Cloudflare Workers

/**
 * Get environment variable value (runtime-agnostic).
 * 
 * Works in:
 * - Deno: uses Deno.env.get()
 * - Node.js: uses process.env
 * - Bun: uses Bun.env or process.env
 * - Cloudflare Workers: uses globalThis (must bind env vars)
 * 
 * @param key - Environment variable name
 * @returns The value or undefined if not found
 * 
 * @example
 * ```ts
 * const secret = getEnv('JWT_SECRET');
 * if (!secret) throw new Error('JWT_SECRET not set');
 * ```
 */
export function getEnv(key: string): string | undefined {
  // Deno
  // deno-lint-ignore no-explicit-any
  if (typeof (globalThis as any).Deno !== 'undefined') {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno.env.get(key);
  }
  
  // Node.js / Bun (both have process.env)
  // deno-lint-ignore no-explicit-any
  if (typeof (globalThis as any).process !== 'undefined') {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).process.env[key];
  }
  
  // Cloudflare Workers / Edge - env vars are typically bound to globalThis
  // deno-lint-ignore no-explicit-any
  return (globalThis as any)[key];
}

/**
 * Get required environment variable or throw.
 * 
 * @param key - Environment variable name
 * @param description - Human-readable description for error message
 * @throws Error if the environment variable is not set
 * 
 * @example
 * ```ts
 * const secret = requireEnv('JWT_SECRET', 'JWT signing secret');
 * // Throws: "JWT_SECRET is required (JWT signing secret). Set it in your environment."
 * ```
 */
export function requireEnv(key: string, description: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(
      `${key} is required (${description}). Set it in your environment.`
    );
  }
  return value;
}
