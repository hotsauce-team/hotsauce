// Basic tests for workers package

import { assertEquals } from '@std/assert';
import { detectRuntime } from '../runtime.ts';

Deno.test('detectRuntime should detect Deno', () => {
  const runtime = detectRuntime();
  assertEquals(runtime, 'deno');
});

Deno.test('worker plugin can be imported', async () => {
  const { createWorkerPlugin } = await import('../mod.ts');
  assertEquals(typeof createWorkerPlugin, 'function');
});
