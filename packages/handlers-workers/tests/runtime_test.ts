// Basic tests for workers package

import { assertEquals } from '@std/assert';

Deno.test('worker plugin can be imported', async () => {
  const { createWorkerPlugin } = await import('../mod.ts');
  assertEquals(typeof createWorkerPlugin, 'function');
});

Deno.test('setupWorkerPlugin can be imported', async () => {
  const { setupWorkerPlugin } = await import('../mod.ts');
  assertEquals(typeof setupWorkerPlugin, 'function');
});

Deno.test('FilterContext type can be imported', async () => {
  const mod = await import('../mod.ts');
  // Type-only import, just check module loads
  assertEquals(typeof mod, 'object');
});
