// Vendored assertion functions for testing without network access
// Minimal implementation matching @std/assert API

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
    const message = msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`;
    throw new AssertionError(message);
  }
}

export function assertExists<T>(actual: T, msg?: string): asserts actual is NonNullable<T> {
  if (actual === null || actual === undefined) {
    throw new AssertionError(msg || `Expected value to exist but got ${actual}`);
  }
}

export function assertThrows(
  fn: () => unknown,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: ErrorConstructor | (new (...args: any[]) => Error),
  msgIncludes?: string | RegExp,
  msg?: string,
): void {
  let thrown = false;
  let error: Error | undefined;
  
  try {
    fn();
  } catch (e) {
    thrown = true;
    error = e as Error;
  }
  
  if (!thrown) {
    throw new AssertionError(msg || "Expected function to throw but it didn't");
  }
  
  if (ErrorClass && error && !(error instanceof ErrorClass)) {
    const errorName = (error as unknown as { constructor?: { name?: string } })?.constructor?.name || 'unknown';
    throw new AssertionError(
      `Expected error to be instance of ${ErrorClass.name} but got ${errorName}`
    );
  }
  
  if (msgIncludes && error) {
    const message = error.message;
    if (typeof msgIncludes === 'string' && !message.includes(msgIncludes)) {
      throw new AssertionError(`Expected error message to include "${msgIncludes}" but got "${message}"`);
    } else if (msgIncludes instanceof RegExp && !msgIncludes.test(message)) {
      throw new AssertionError(`Expected error message to match ${msgIncludes} but got "${message}"`);
    }
  }
}

export function assertStringIncludes(actual: string, expected: string, msg?: string): void {
  if (!actual.includes(expected)) {
    throw new AssertionError(
      msg || `Expected string to include "${expected}" but got "${actual}"`
    );
  }
}

export function assertNotEquals<T>(actual: T, expected: T, msg?: string): void {
  if (actual === expected || JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new AssertionError(msg || `Expected values to not be equal but both are ${JSON.stringify(actual)}`);
  }
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: ErrorConstructor | (new (...args: any[]) => Error),
  msgIncludes?: string | RegExp,
  msg?: string,
): Promise<void> {
  let thrown = false;
  let error: Error | undefined;
  
  try {
    await fn();
  } catch (e) {
    thrown = true;
    error = e as Error;
  }
  
  if (!thrown) {
    throw new AssertionError(msg || "Expected promise to reject but it didn't");
  }
  
  if (ErrorClass && error && !(error instanceof ErrorClass)) {
    const errorName = (error as unknown as { constructor?: { name?: string } })?.constructor?.name || 'unknown';
    throw new AssertionError(
      `Expected error to be instance of ${ErrorClass.name} but got ${errorName}`
    );
  }
  
  if (msgIncludes && error) {
    const message = error.message;
    if (typeof msgIncludes === 'string' && !message.includes(msgIncludes)) {
      throw new AssertionError(`Expected error message to include "${msgIncludes}" but got "${message}"`);
    } else if (msgIncludes instanceof RegExp && !msgIncludes.test(message)) {
      throw new AssertionError(`Expected error message to match ${msgIncludes} but got "${message}"`);
    }
  }
}

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}
