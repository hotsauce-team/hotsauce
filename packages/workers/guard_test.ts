// Tests for the worker isolation guard

import { assertEquals } from '@std/assert';
import {
  assertWorkerContext,
  type CmsGlobalThis,
  isWorkerContext,
} from './guard.ts';

Deno.test('isWorkerContext: returns true when main thread marker not set', () => {
  // In tests, createCmsHandler is never called, so marker is undefined
  assertEquals(isWorkerContext(), true);
});

Deno.test('assertWorkerContext: does not throw when marker not set', () => {
  // Should not throw since createCmsHandler was never called
  assertWorkerContext();
});

Deno.test('isWorkerContext: returns false when main thread marker is set', () => {
  // Simulate being on the main CMS thread
  const original = (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__;
  try {
    (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__ = true;
    assertEquals(isWorkerContext(), false);
  } finally {
    (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__ = original;
  }
});

Deno.test('assertWorkerContext: throws when main thread marker is set', () => {
  const original = (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__;
  try {
    (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__ = true;
    let threw = false;
    try {
      assertWorkerContext();
    } catch (e) {
      threw = true;
      assertEquals(e instanceof Error, true);
      assertEquals(
        (e as Error).message.includes('Worker thread'),
        true,
      );
    }
    assertEquals(threw, true, 'assertWorkerContext should have thrown');
  } finally {
    (globalThis as CmsGlobalThis).__CMS_MAIN_PROCESS__ = original;
  }
});
