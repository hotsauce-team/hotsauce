// Basic tests for workers package

import { assertEquals, assertThrows } from '@std/assert';

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

Deno.test('createWorkerPlugin throws error without allow function', async () => {
  const { createWorkerPlugin } = await import('../mod.ts');
  
  // Create a mock worker
  const mockWorker = {
    postMessage: () => {},
    onmessage: null,
  } as unknown as Worker;
  
  // Should throw when allow is not provided
  assertThrows(
    () => createWorkerPlugin(mockWorker, { config: {} } as any),
    Error,
    'Worker plugin requires an "allow" function'
  );
  
  // Should throw when options is empty
  assertThrows(
    () => createWorkerPlugin(mockWorker, {} as any),
    Error,
    'Worker plugin requires an "allow" function'
  );
});

Deno.test('createWorkerPlugin succeeds with allow function', async () => {
  const { createWorkerPlugin } = await import('../mod.ts');
  
  // Create a mock worker
  const mockWorker = {
    postMessage: () => {},
    onmessage: null,
  } as unknown as Worker;
  
  // Should not throw when allow is provided
  const plugin = createWorkerPlugin(mockWorker, {
    allow: (ctx) => ctx.hook === 'afterCreate'
  });
  
  assertEquals(plugin.name, 'worker-isolated-plugin');
  assertEquals(typeof plugin.hooks, 'object');
});

