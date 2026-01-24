// Runtime validation for Serializable data
// Catches issues that TypeScript cannot detect at compile time

/**
 * Error thrown when data cannot be serialized for Worker communication.
 * Provides detailed path information for debugging.
 */
export class SerializationError extends Error {
  constructor(
    message: string,
    /** Path to the problematic value (e.g., "data.user.callback") */
    public readonly path: string,
    /** Type of the problematic value */
    public readonly valueType: string,
  ) {
    super(`${message} at "${path}" (type: ${valueType})`);
    this.name = 'SerializationError';
  }
}

/**
 * Options for validateSerializable
 */
export interface ValidationOptions {
  /** Maximum object depth to traverse (default: 50) */
  maxDepth?: number;
  /** Maximum total properties to check (default: 10000) */
  maxProperties?: number;
  /** Whether to allow undefined values (default: true, matches structured clone) */
  allowUndefined?: boolean;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  maxDepth: 50,
  maxProperties: 10000,
  allowUndefined: true,
};

/**
 * Non-serializable types that would be silently dropped or corrupted
 */
const NON_SERIALIZABLE_TYPES = [
  'function',
  'symbol',
  'bigint', // Not JSON-safe, though structured clone supports it
] as const;

/**
 * Built-in objects that don't serialize properly
 */
function isNonSerializableObject(value: unknown): string | null {
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  if (value instanceof WeakMap) return 'WeakMap';
  if (value instanceof WeakSet) return 'WeakSet';
  if (value instanceof RegExp) return 'RegExp';
  if (value instanceof Error) return 'Error';
  if (value instanceof Promise) return 'Promise';
  if (typeof value === 'function') return 'Function';

  // ArrayBuffer and typed arrays are actually supported by structured clone,
  // but not by JSON. For cross-runtime safety, flag them.
  if (value instanceof ArrayBuffer) return 'ArrayBuffer';
  if (ArrayBuffer.isView(value)) return 'TypedArray';

  return null;
}

/**
 * Validate that data is serializable for Worker communication.
 *
 * Detects:
 * - Functions (silently dropped by postMessage)
 * - Symbols (not serializable)
 * - Map, Set, WeakMap, WeakSet (become empty objects)
 * - RegExp (becomes empty object)
 * - Error objects (lose stack trace, become plain object)
 * - Circular references (would throw on JSON.stringify)
 * - Excessive depth/size (memory protection)
 *
 * @throws SerializationError with path to problematic value
 *
 * @example
 * ```ts
 * // Throws: SerializationError: Cannot serialize function at "data.callback"
 * validateSerializable({ callback: () => {} });
 *
 * // Throws: SerializationError: Cannot serialize Map at "data.users"
 * validateSerializable({ users: new Map() });
 *
 * // OK - Date is supported
 * validateSerializable({ created: new Date() });
 * ```
 */
export function validateSerializable(
  data: unknown,
  options: ValidationOptions = {},
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const seen = new WeakSet<object>();
  let propertyCount = 0;

  function validate(value: unknown, path: string, depth: number): void {
    // Check depth limit
    if (depth > opts.maxDepth) {
      throw new SerializationError(
        'Maximum depth exceeded',
        path,
        'object',
      );
    }

    // Check property count
    if (++propertyCount > opts.maxProperties) {
      throw new SerializationError(
        'Maximum property count exceeded',
        path,
        typeof value,
      );
    }

    // Handle null
    if (value === null) {
      return;
    }

    // Handle undefined
    if (value === undefined) {
      if (!opts.allowUndefined) {
        throw new SerializationError(
          'Undefined values not allowed',
          path,
          'undefined',
        );
      }
      return;
    }

    // Check primitive types
    const type = typeof value;

    if (
      NON_SERIALIZABLE_TYPES.includes(
        type as typeof NON_SERIALIZABLE_TYPES[number],
      )
    ) {
      throw new SerializationError(
        `Cannot serialize ${type}`,
        path,
        type,
      );
    }

    // Primitives that are OK
    if (type === 'string' || type === 'number' || type === 'boolean') {
      // Check for special number values
      if (type === 'number') {
        if (Number.isNaN(value as number)) {
          throw new SerializationError(
            'NaN is not JSON-serializable',
            path,
            'NaN',
          );
        }
        if (!Number.isFinite(value as number)) {
          throw new SerializationError(
            'Infinity is not JSON-serializable',
            path,
            'Infinity',
          );
        }
      }
      return;
    }

    // Must be an object at this point
    if (type !== 'object') {
      throw new SerializationError(
        `Unknown type: ${type}`,
        path,
        type,
      );
    }

    // Check for non-serializable built-in objects
    const nonSerializableType = isNonSerializableObject(value);
    if (nonSerializableType) {
      throw new SerializationError(
        `Cannot serialize ${nonSerializableType}`,
        path,
        nonSerializableType,
      );
    }

    // Date is OK (structured clone preserves it)
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new SerializationError(
          'Invalid Date is not serializable',
          path,
          'Invalid Date',
        );
      }
      return;
    }

    // Check for circular references
    if (seen.has(value as object)) {
      throw new SerializationError(
        'Circular reference detected',
        path,
        'circular',
      );
    }
    seen.add(value as object);

    // Handle arrays
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        validate(value[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    // Handle plain objects
    // Check that it's a plain object (not a class instance)
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      const constructorName = (value as object).constructor?.name ?? 'unknown';
      throw new SerializationError(
        `Cannot serialize class instance`,
        path,
        constructorName,
      );
    }

    // Validate all properties
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      // Check for symbol keys (Object.keys doesn't return them, but be safe)
      validate(obj[key], path ? `${path}.${key}` : key, depth + 1);
    }

    // Check for symbol properties explicitly
    const symbolKeys = Object.getOwnPropertySymbols(obj);
    if (symbolKeys.length > 0) {
      throw new SerializationError(
        'Object has Symbol properties which cannot be serialized',
        path,
        'Symbol',
      );
    }
  }

  validate(data, '', 0);
}

/**
 * Check if data is serializable without throwing.
 * Returns validation result with error details if invalid.
 *
 * @example
 * ```ts
 * const result = isSerializable({ fn: () => {} });
 * if (!result.valid) {
 *   console.log(result.error); // "Cannot serialize function at 'fn'"
 * }
 * ```
 */
export function isSerializable(
  data: unknown,
  options?: ValidationOptions,
): { valid: true } | { valid: false; error: string; path: string } {
  try {
    validateSerializable(data, options);
    return { valid: true };
  } catch (error) {
    if (error instanceof SerializationError) {
      return {
        valid: false,
        error: error.message,
        path: error.path,
      };
    }
    throw error;
  }
}
