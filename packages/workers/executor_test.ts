// Tests for WorkerExecutor concurrent execution
// Verifies request/response matching and isolation

import { assertEquals, assertRejects } from '@std/assert';
import { WorkerExecutor } from './executor.ts';
import type { RegisteredPlugin } from './executor.ts';

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

function createTestWorker(): Worker {
  return new Worker(import.meta.resolve('./test-worker.ts'), {
    type: 'module',
  });
}

function createRegisteredPlugin(
  name: string,
  worker: Worker,
): RegisteredPlugin {
  return {
    plugin: {
      name,
      worker,
      hooks: { on: ['create', 'update', 'delete'] },
    },
    initialized: false,
    isWorker: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Concurrent requests to same plugin
// ─────────────────────────────────────────────────────────────

Deno.test('WorkerExecutor: handles concurrent requests to same plugin', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('echo-plugin', worker);

  try {
    await executor.initPlugin(plugin);

    // Send 5 requests concurrently with different delays
    // Responses should come back in different order than sent
    const requests = [
      { delay: 50, echo: 'first-sent' },
      { delay: 10, echo: 'second-sent' },
      { delay: 30, echo: 'third-sent' },
      { delay: 5, echo: 'fourth-sent' },
      { delay: 20, echo: 'fifth-sent' },
    ];

    // Fire all requests simultaneously using executeBeforeSave (which returns data)
    const ctx = { table: 'test', action: 'create' as const };
    const promises = requests.map((req) =>
      executor.executeBeforeSave([plugin], ctx, req)
    );

    // Wait for all to complete
    const results = await Promise.all(promises);

    // All requests should complete (not mixed up or lost)
    assertEquals(results.length, 5);

    // Verify each result has the correct echo value
    const echos = results.map((r) => (r as Record<string, unknown>).echo);
    assertEquals(echos.includes('first-sent'), true);
    assertEquals(echos.includes('second-sent'), true);
    assertEquals(echos.includes('third-sent'), true);
    assertEquals(echos.includes('fourth-sent'), true);
    assertEquals(echos.includes('fifth-sent'), true);
  } finally {
    executor.terminate();
  }
});

Deno.test('WorkerExecutor: concurrent requests get correct responses (not mixed up)', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('echo-plugin', worker);

  try {
    await executor.initPlugin(plugin);

    const ctx = { table: 'users', action: 'create' as const };

    // Transform hooks return data, so we can verify correct responses
    // Use executeBeforeSave which returns the transformed data
    const promises = [
      executor.executeBeforeSave([plugin], ctx, { id: 1, marker: 'request-A' }),
      executor.executeBeforeSave([plugin], ctx, { id: 2, marker: 'request-B' }),
      executor.executeBeforeSave([plugin], ctx, { id: 3, marker: 'request-C' }),
    ];

    const [resultA, resultB, resultC] = await Promise.all(promises);

    // Each result should have its original marker (not mixed up)
    // The test worker echoes back the data
    assertEquals((resultA as Record<string, unknown>).marker, 'request-A');
    assertEquals((resultB as Record<string, unknown>).marker, 'request-B');
    assertEquals((resultC as Record<string, unknown>).marker, 'request-C');
  } finally {
    executor.terminate();
  }
});

// ─────────────────────────────────────────────────────────────
// Multiple plugins running concurrently
// ─────────────────────────────────────────────────────────────

Deno.test('WorkerExecutor: handles multiple plugins concurrently', async () => {
  const executor = new WorkerExecutor();
  const worker1 = createTestWorker();
  const worker2 = createTestWorker();
  const plugin1 = createRegisteredPlugin('plugin-one', worker1);
  const plugin2 = createRegisteredPlugin('plugin-two', worker2);

  try {
    // Initialize both plugins
    await Promise.all([
      executor.initPlugin(plugin1),
      executor.initPlugin(plugin2),
    ]);

    const ctx = { table: 'posts', action: 'update' as const };

    // Send to both plugins simultaneously
    const [result1, result2] = await Promise.all([
      executor.executeBeforeSave([plugin1], ctx, { source: 'plugin-one-data' }),
      executor.executeBeforeSave([plugin2], ctx, { source: 'plugin-two-data' }),
    ]);

    // Each plugin should get its own data
    assertEquals(
      (result1 as Record<string, unknown>).source,
      'plugin-one-data',
    );
    assertEquals(
      (result2 as Record<string, unknown>).source,
      'plugin-two-data',
    );
  } finally {
    executor.terminate();
  }
});

Deno.test('WorkerExecutor: plugin failure does not affect other plugins', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((error) => errors.push(error));
  const worker1 = createTestWorker();
  const worker2 = createTestWorker();
  const plugin1 = createRegisteredPlugin('failing-plugin', worker1);
  const plugin2 = createRegisteredPlugin('working-plugin', worker2);

  try {
    await Promise.all([
      executor.initPlugin(plugin1),
      executor.initPlugin(plugin2),
    ]);

    const ctx = { table: 'comments', action: 'delete' as const };

    // Plugin 1 will fail, plugin 2 should still work
    // Note: executeBeforeSave runs plugins sequentially, so we test with separate calls
    const failPromise = executor.executeBeforeSave(
      [plugin1],
      ctx,
      { fail: true, failMessage: 'Intentional test failure' },
    );

    const successPromise = executor.executeBeforeSave(
      [plugin2],
      ctx,
      { success: true, data: 'should work' },
    );

    // The failing plugin should reject
    await assertRejects(
      () => failPromise,
      Error,
      'execution failed', // Sanitized error message
    );

    // The working plugin should succeed
    const successResult = await successPromise;
    assertEquals((successResult as Record<string, unknown>).success, true);

    // Error handler should have been called with full error
    assertEquals(errors.length, 1);
    assertEquals(errors[0]?.message, 'Intentional test failure');
  } finally {
    executor.terminate();
  }
});

// ─────────────────────────────────────────────────────────────
// Stress test
// ─────────────────────────────────────────────────────────────

Deno.test('WorkerExecutor: handles many concurrent requests', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('stress-plugin', worker);

  try {
    await executor.initPlugin(plugin);

    const ctx = { table: 'items', action: 'create' as const };

    // Send 50 requests concurrently
    const count = 50;
    const promises = Array.from(
      { length: count },
      (_, i) =>
        executor.executeBeforeSave([plugin], ctx, {
          index: i,
          marker: `req-${i}`,
        }),
    );

    const results = await Promise.all(promises);

    // All should complete
    assertEquals(results.length, count);

    // Each should have correct marker (verify no mix-ups)
    const markers = new Set(
      results.map((r) => (r as Record<string, unknown>).marker),
    );
    assertEquals(markers.size, count); // All unique

    // Verify all expected markers present
    for (let i = 0; i < count; i++) {
      assertEquals(markers.has(`req-${i}`), true);
    }
  } finally {
    executor.terminate();
  }
});

// ─────────────────────────────────────────────────────────────
// Termination during pending requests
// ─────────────────────────────────────────────────────────────

Deno.test('WorkerExecutor: terminatePlugin removes worker', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('temp-plugin', worker);

  await executor.initPlugin(plugin);

  // Terminate the specific plugin
  executor.terminatePlugin('temp-plugin');

  // Trying to send should fail
  const ctx = { table: 'test', action: 'read' as const };
  await assertRejects(
    () => executor.executeBeforeSave([plugin], ctx, { data: 'test' }),
    Error,
    'No worker for plugin',
  );
});
