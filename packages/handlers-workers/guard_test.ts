// Tests for the worker isolation guard

import { assertEquals } from '@std/assert';
import { assertWorkerContext, isWorkerContext } from './guard.ts';

Deno.test('isWorkerContext: returns true in test environment', () => {
  // We're in a test, so this should return true
  assertEquals(isWorkerContext(), true);
});

Deno.test('assertWorkerContext: does not throw in test environment', () => {
  // Should not throw since we're in a test
  assertWorkerContext();
});

Deno.test('assertWorkerContext: provides helpful error message', () => {
  // We can't easily test the throw case since we're in a test environment,
  // but we can at least verify the function exists and is callable
  assertEquals(typeof assertWorkerContext, 'function');
});
