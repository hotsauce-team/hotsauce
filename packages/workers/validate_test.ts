import { assertEquals, assertThrows } from '@std/assert';
import {
  isSerializable,
  SerializationError,
  validateSerializable,
} from './validate.ts';

// ─────────────────────────────────────────────────────────────
// Valid serializable data
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - accepts primitives', () => {
  validateSerializable(null);
  validateSerializable(undefined);
  validateSerializable('hello');
  validateSerializable(42);
  validateSerializable(3.14);
  validateSerializable(true);
  validateSerializable(false);
});

Deno.test('validateSerializable - accepts Date', () => {
  validateSerializable(new Date());
  validateSerializable(new Date('2024-01-01'));
});

Deno.test('validateSerializable - accepts arrays', () => {
  validateSerializable([]);
  validateSerializable([1, 2, 3]);
  validateSerializable(['a', 'b', 'c']);
  validateSerializable([1, 'mixed', true, null]);
  validateSerializable([[1, 2], [3, 4]]);
});

Deno.test('validateSerializable - accepts plain objects', () => {
  validateSerializable({});
  validateSerializable({ name: 'test' });
  validateSerializable({ nested: { value: 42 } });
  validateSerializable({ array: [1, 2, 3], obj: { a: 1 } });
});

Deno.test('validateSerializable - accepts complex valid structures', () => {
  validateSerializable({
    user: {
      id: 123,
      name: 'Alice',
      roles: ['admin', 'user'],
      metadata: {
        createdAt: new Date(),
        tags: ['important', 'verified'],
      },
    },
    settings: {
      notifications: true,
      theme: 'dark',
    },
  });
});

// ─────────────────────────────────────────────────────────────
// Functions (silently dropped by postMessage)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects functions', () => {
  const error = assertThrows(
    () => validateSerializable({ callback: () => {} }),
    SerializationError,
  );
  assertEquals(error.path, 'callback');
  assertEquals(error.valueType, 'function');
});

Deno.test('validateSerializable - rejects nested functions', () => {
  const error = assertThrows(
    () =>
      validateSerializable({
        user: {
          validate: function () {},
        },
      }),
    SerializationError,
  );
  assertEquals(error.path, 'user.validate');
});

Deno.test('validateSerializable - rejects arrow functions in arrays', () => {
  const error = assertThrows(
    () => validateSerializable({ handlers: [() => {}, () => {}] }),
    SerializationError,
  );
  assertEquals(error.path, 'handlers[0]');
});

// ─────────────────────────────────────────────────────────────
// Symbols
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects symbol values', () => {
  const error = assertThrows(
    () => validateSerializable({ id: Symbol('test') }),
    SerializationError,
  );
  assertEquals(error.valueType, 'symbol');
});

// ─────────────────────────────────────────────────────────────
// Map, Set, WeakMap, WeakSet (become empty objects)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects Map', () => {
  const error = assertThrows(
    () => validateSerializable({ users: new Map([['a', 1]]) }),
    SerializationError,
  );
  assertEquals(error.path, 'users');
  assertEquals(error.valueType, 'Map');
});

Deno.test('validateSerializable - rejects Set', () => {
  const error = assertThrows(
    () => validateSerializable({ tags: new Set(['a', 'b']) }),
    SerializationError,
  );
  assertEquals(error.valueType, 'Set');
});

Deno.test('validateSerializable - rejects WeakMap', () => {
  const error = assertThrows(
    () => validateSerializable({ cache: new WeakMap() }),
    SerializationError,
  );
  assertEquals(error.valueType, 'WeakMap');
});

Deno.test('validateSerializable - rejects WeakSet', () => {
  const error = assertThrows(
    () => validateSerializable({ seen: new WeakSet() }),
    SerializationError,
  );
  assertEquals(error.valueType, 'WeakSet');
});

// ─────────────────────────────────────────────────────────────
// RegExp (becomes empty object)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects RegExp', () => {
  const error = assertThrows(
    () => validateSerializable({ pattern: /test/i }),
    SerializationError,
  );
  assertEquals(error.valueType, 'RegExp');
});

// ─────────────────────────────────────────────────────────────
// Error objects (lose important info)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects Error objects', () => {
  const error = assertThrows(
    () => validateSerializable({ lastError: new Error('oops') }),
    SerializationError,
  );
  assertEquals(error.valueType, 'Error');
});

Deno.test('validateSerializable - rejects TypeError', () => {
  assertThrows(
    () => validateSerializable({ err: new TypeError('bad type') }),
    SerializationError,
  );
});

// ─────────────────────────────────────────────────────────────
// Promises (makes no sense to serialize)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects Promise', () => {
  const error = assertThrows(
    () => validateSerializable({ pending: Promise.resolve(42) }),
    SerializationError,
  );
  assertEquals(error.valueType, 'Promise');
});

// ─────────────────────────────────────────────────────────────
// Circular references
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects circular references', () => {
  const obj: Record<string, unknown> = { name: 'test' };
  obj.self = obj;

  const error = assertThrows(
    () => validateSerializable(obj),
    SerializationError,
  );
  assertEquals(error.path, 'self');
  assertEquals(error.valueType, 'circular');
});

Deno.test('validateSerializable - rejects deep circular references', () => {
  const a: Record<string, unknown> = { name: 'a' };
  const b: Record<string, unknown> = { name: 'b', parent: a };
  a.child = b;

  assertThrows(
    () => validateSerializable(a),
    SerializationError,
  );
});

// ─────────────────────────────────────────────────────────────
// Class instances
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects class instances', () => {
  class User {
    constructor(public name: string) {}
  }

  const error = assertThrows(
    () => validateSerializable({ user: new User('Alice') }),
    SerializationError,
  );
  assertEquals(error.path, 'user');
  assertEquals(error.valueType, 'User');
});

// ─────────────────────────────────────────────────────────────
// Special number values
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects NaN', () => {
  const error = assertThrows(
    () => validateSerializable({ value: NaN }),
    SerializationError,
  );
  assertEquals(error.valueType, 'NaN');
});

Deno.test('validateSerializable - rejects Infinity', () => {
  assertThrows(
    () => validateSerializable({ value: Infinity }),
    SerializationError,
  );
  assertThrows(
    () => validateSerializable({ value: -Infinity }),
    SerializationError,
  );
});

// ─────────────────────────────────────────────────────────────
// Invalid Date
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects invalid Date', () => {
  const error = assertThrows(
    () => validateSerializable({ date: new Date('invalid') }),
    SerializationError,
  );
  assertEquals(error.valueType, 'Invalid Date');
});

// ─────────────────────────────────────────────────────────────
// BigInt (not JSON-serializable)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects BigInt', () => {
  const error = assertThrows(
    () => validateSerializable({ big: BigInt(9007199254740991) }),
    SerializationError,
  );
  assertEquals(error.valueType, 'bigint');
});

// ─────────────────────────────────────────────────────────────
// Depth and size limits
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - respects maxDepth option', () => {
  const deep = { a: { b: { c: { d: { e: 1 } } } } };

  // Should pass with default depth
  validateSerializable(deep);

  // Should fail with low depth
  assertThrows(
    () => validateSerializable(deep, { maxDepth: 3 }),
    SerializationError,
    'Maximum depth exceeded',
  );
});

Deno.test('validateSerializable - respects maxProperties option', () => {
  const wide: Record<string, number> = {};
  for (let i = 0; i < 100; i++) {
    wide[`prop${i}`] = i;
  }

  // Should pass with default limit
  validateSerializable(wide);

  // Should fail with low limit
  assertThrows(
    () => validateSerializable(wide, { maxProperties: 50 }),
    SerializationError,
    'Maximum property count exceeded',
  );
});

// ─────────────────────────────────────────────────────────────
// undefined handling
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - allows undefined by default', () => {
  validateSerializable({ value: undefined });
  validateSerializable(undefined);
});

Deno.test('validateSerializable - can reject undefined', () => {
  assertThrows(
    () => validateSerializable({ value: undefined }, { allowUndefined: false }),
    SerializationError,
    'Undefined values not allowed',
  );
});

// ─────────────────────────────────────────────────────────────
// isSerializable helper
// ─────────────────────────────────────────────────────────────

Deno.test('isSerializable - returns valid: true for good data', () => {
  const result = isSerializable({ name: 'test', count: 42 });
  assertEquals(result.valid, true);
});

Deno.test('isSerializable - returns error info for bad data', () => {
  const result = isSerializable({ callback: () => {} });
  assertEquals(result.valid, false);
  if (!result.valid) {
    assertEquals(result.path, 'callback');
    assertEquals(typeof result.error, 'string');
  }
});

// ─────────────────────────────────────────────────────────────
// ArrayBuffer and TypedArrays (not JSON-safe)
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects ArrayBuffer', () => {
  const error = assertThrows(
    () => validateSerializable({ buffer: new ArrayBuffer(8) }),
    SerializationError,
  );
  assertEquals(error.valueType, 'ArrayBuffer');
});

Deno.test('validateSerializable - rejects Uint8Array', () => {
  const error = assertThrows(
    () => validateSerializable({ data: new Uint8Array([1, 2, 3]) }),
    SerializationError,
  );
  assertEquals(error.valueType, 'TypedArray');
});

// ─────────────────────────────────────────────────────────────
// Symbol properties
// ─────────────────────────────────────────────────────────────

Deno.test('validateSerializable - rejects objects with Symbol properties', () => {
  const sym = Symbol('hidden');
  const obj = { visible: 1 };
  Object.defineProperty(obj, sym, { value: 'secret', enumerable: true });

  const error = assertThrows(
    () => validateSerializable(obj),
    SerializationError,
  );
  assertEquals(error.valueType, 'Symbol');
});
