// Tests for WorkerExecutor concurrent execution
// Verifies request/response matching and isolation

import { assert, assertEquals, assertRejects } from '@std/assert';
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

// ─────────────────────────────────────────────────────────────
// FieldUIOverride validation tests (via executeRenderField)
// ─────────────────────────────────────────────────────────────

import type { PluginHooks, UIRenderFieldContext } from './types.ts';

function createInProcessUIPlugin(
  name: string,
  renderFieldFn: (ctx: UIRenderFieldContext) => unknown,
): RegisteredPlugin {
  const hooks: PluginHooks = {
    ui: {
      renderField: renderFieldFn as PluginHooks['ui'] extends
        { renderField?: infer F } ? F : never,
    },
  };
  return {
    plugin: {
      name,
      hooks,
      // Note: filter is optional for test purposes since PluginConfig here
      // doesn't require it (it's in the CMS-specific types)
    },
    initialized: true,
    isWorker: false,
  };
}

const testUIFieldContext: UIRenderFieldContext = {
  table: 'posts',
  field: {
    name: 'content',
    label: 'Content',
    fieldType: 'textarea',
    columnType: 'text',
    required: false,
    readOnly: false,
  },
  value: 'test content',
  recordId: '1',
  view: 'edit',
};

Deno.test('FieldUIOverride validation: accepts null', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => null);

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: accepts undefined', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => undefined);

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: accepts valid link', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const validLink = { link: { label: 'Edit', href: '/edit/1' } };
  const plugin = createInProcessUIPlugin('test', () => validLink);

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, validLink);
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: accepts link with target', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const validLink = {
    link: { label: 'Edit', href: '/edit/1', target: '_blank' as const },
  };
  const plugin = createInProcessUIPlugin('test', () => validLink);

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, validLink);
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: rejects non-object', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => 'invalid string');

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('Expected null or an object'), true);
});

Deno.test('FieldUIOverride validation: rejects missing link property', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({ other: 'prop' }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes(
      "Expected object with 'link' and/or 'valueSummary'",
    ),
    true,
  );
});

Deno.test('FieldUIOverride validation: rejects link with missing label', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin(
    'test',
    () => ({ link: { href: '/test' } }),
  );

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'link.label' to be a string"),
    true,
  );
});

Deno.test('FieldUIOverride validation: rejects link with missing href', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin(
    'test',
    () => ({ link: { label: 'Test' } }),
  );

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes("'link.href' to be a string"), true);
});

Deno.test('FieldUIOverride validation: rejects invalid target', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Test', href: '/test', target: '_self' },
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'link.target' to be '_blank'"),
    true,
  );
});

Deno.test('FieldUIOverride validation: rejects unexpected properties on link', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Test', href: '/test', extra: 'prop' },
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("Unexpected properties on 'link'"),
    true,
  );
});

Deno.test('FieldUIOverride validation: rejects unexpected properties on root', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Test', href: '/test' },
    extra: 'prop',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes('Unexpected properties on FieldUIOverride'),
    true,
  );
});

Deno.test('FieldUIOverride validation: accepts valueSummary only (no link)', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    valueSummary: '3 blocks',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, { valueSummary: '3 blocks' });
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: accepts valueSummary with valid fileUrl (no link)', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  // Detail view pattern: valueSummary + fileUrl, no upload link
  const plugin = createInProcessUIPlugin('test', () => ({
    valueSummary: 'image.jpg (50KB)',
    fileUrl: '/files/media/file/123',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, {
    valueSummary: 'image.jpg (50KB)',
    fileUrl: '/files/media/file/123',
  });
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: valueSummary with fileUrl: undefined calls onError', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  // Bug pattern: fileUrl property exists but is undefined (detail view case)
  const plugin = createInProcessUIPlugin('test', () => ({
    valueSummary: 'No file',
    fileUrl: undefined,
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  // CRITICAL: onError must be called
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'fileUrl' to be a string"),
    true,
  );
});

Deno.test('FieldUIOverride validation: accepts link with valueSummary', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Edit', href: '/edit' },
    valueSummary: '3 blocks',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, {
    link: { label: 'Edit', href: '/edit' },
    valueSummary: '3 blocks',
  });
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: rejects valueSummary wrong type', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    valueSummary: 123,
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'valueSummary' to be a string"),
    true,
  );
});

Deno.test('FieldUIOverride validation: fileUrl: undefined calls onError and returns null', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  // This was the actual bug - plugin returned { link: ..., valueSummary: ..., fileUrl: undefined }
  // which fails validation because 'fileUrl' property exists but is not a string
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'No file',
    fileUrl: undefined,
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  // Should return null (graceful degradation)
  assertEquals(result, null);
  // CRITICAL: onError must be called so admins can see the problem in logs
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'fileUrl' to be a string"),
    true,
  );
  assertEquals(
    errors[0]!.message.includes("Plugin 'test'"),
    true,
  );
});

Deno.test('FieldUIOverride validation: accepts link with valueSummary and fileUrl omitted', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  // Correct pattern: omit fileUrl entirely when undefined
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'No file',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, {
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'No file',
  });
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: accepts link with valueSummary and valid fileUrl', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'image.jpg (50KB)',
    fileUrl: '/files/media/file/123',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, {
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'image.jpg (50KB)',
    fileUrl: '/files/media/file/123',
  });
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride validation: rejects fileUrl wrong type', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Upload', href: '/upload' },
    valueSummary: 'file.txt',
    fileUrl: 123, // wrong type
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(
    errors[0]!.message.includes("'fileUrl' to be a string"),
    true,
  );
});

Deno.test('FieldUIOverride validation: rejects javascript: in fileUrl', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    valueSummary: 'file.txt',
    fileUrl: 'javascript:alert(1)',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('Unsafe URL scheme'), true);
});

Deno.test('FieldUIOverride validation: rejects javascript: in link.href', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'XSS', href: 'javascript:alert(1)' },
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('Unsafe URL scheme'), true);
});

Deno.test('FieldUIOverride validation: accepts relative URLs', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'Upload', href: '/admin/upload' },
    fileUrl: '/files/media/file/123',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(errors.length, 0);
  assertEquals(result?.fileUrl, '/files/media/file/123');
});

Deno.test('FieldUIOverride validation: accepts https URLs', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: {
      label: 'External',
      href: 'https://example.com/upload',
      target: '_blank',
    },
    fileUrl: 'https://cdn.example.com/files/123',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(errors.length, 0);
  assertEquals(result?.fileUrl, 'https://cdn.example.com/files/123');
});

Deno.test('FieldUIOverride validation: accepts http URLs', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: {
      label: 'External',
      href: 'http://example.com/upload',
      target: '_blank',
    },
    fileUrl: 'http://cdn.example.com/files/123',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(errors.length, 0);
  assertEquals(result?.fileUrl, 'http://cdn.example.com/files/123');
});

Deno.test('FieldUIOverride validation: rejects scheme-relative URLs', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    link: { label: 'External', href: '//evil.com/payload' },
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('Unsafe URL scheme'), true);
});

Deno.test('FieldUIOverride validation: rejects backslash-prefixed URLs', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const plugin = createInProcessUIPlugin('test', () => ({
    fileUrl: '\\\\evil.com\\payload',
    valueSummary: 'test',
  }));

  const result = await executor.executeRenderField(
    [plugin],
    testUIFieldContext,
  );

  assertEquals(result, null);
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('Unsafe URL scheme'), true);
});

Deno.test('FieldUIOverride validation: continues to next plugin on invalid return', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));

  // First plugin returns invalid, second returns valid
  const invalidPlugin = createInProcessUIPlugin('invalid-plugin', () => 'bad');
  const validPlugin = createInProcessUIPlugin('valid-plugin', () => ({
    link: { label: 'Valid', href: '/valid' },
  }));

  const result = await executor.executeRenderField(
    [invalidPlugin, validPlugin],
    testUIFieldContext,
  );

  // Should get valid result from second plugin
  assertEquals(result, { link: { label: 'Valid', href: '/valid' } });
  // Should have one error from first plugin
  assertEquals(errors.length, 1);
  assertEquals(errors[0]!.message.includes('invalid-plugin'), true);
});

// ─────────────────────────────────────────────────────────────
// Plugin config extraction tests
// ─────────────────────────────────────────────────────────────

Deno.test('FieldUIOverride: extracts plugin-specific config from _plugins', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));

  // Track what the plugin receives
  let receivedCtx: UIRenderFieldContext | null = null;
  const plugin = createInProcessUIPlugin('puck', (ctx) => {
    receivedCtx = ctx;
    return null;
  });

  const ctxWithPlugins: UIRenderFieldContext = {
    ...testUIFieldContext,
    field: {
      ...testUIFieldContext.field,
      _plugins: {
        puck: { variant: 'full' },
        other: { setting: true },
      },
    },
  };

  await executor.executeRenderField([plugin], ctxWithPlugins);

  // Plugin should receive only its own config in `plugin`
  assertEquals(receivedCtx!.field.plugin, { variant: 'full' });
  // Plugin should NOT see other plugins' configs
  assertEquals(receivedCtx!.field._plugins, undefined);
  assertEquals(errors.length, 0);
});

Deno.test('FieldUIOverride: plugin receives undefined when no config for that plugin', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));

  let receivedCtx: UIRenderFieldContext | null = null;
  const plugin = createInProcessUIPlugin('puck', (ctx) => {
    receivedCtx = ctx;
    return null;
  });

  const ctxWithOtherPlugins: UIRenderFieldContext = {
    ...testUIFieldContext,
    field: {
      ...testUIFieldContext.field,
      _plugins: {
        other: { setting: true }, // No 'puck' config
      },
    },
  };

  await executor.executeRenderField([plugin], ctxWithOtherPlugins);

  // Plugin should receive undefined for its config
  assertEquals(receivedCtx!.field.plugin, undefined);
  assertEquals(receivedCtx!.field._plugins, undefined);
});

Deno.test('FieldUIOverride: plugin receives true when config is boolean', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));

  let receivedCtx: UIRenderFieldContext | null = null;
  const plugin = createInProcessUIPlugin('puck', (ctx) => {
    receivedCtx = ctx;
    return null;
  });

  const ctxWithBoolConfig: UIRenderFieldContext = {
    ...testUIFieldContext,
    field: {
      ...testUIFieldContext.field,
      _plugins: {
        puck: true, // Simple boolean config
      },
    },
  };

  await executor.executeRenderField([plugin], ctxWithBoolConfig);

  // Plugin should receive true
  assertEquals(receivedCtx!.field.plugin, true);
});

// ─────────────────────────────────────────────────────────────
// Worker Route Rendering
// ─────────────────────────────────────────────────────────────

Deno.test('WorkerExecutor: executeRouteRender returns HTML from Worker', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('editor-plugin', worker);

  try {
    await executor.initPlugin(plugin);

    const context = {
      table: 'posts',
      recordId: '123',
      column: 'body',
      record: { id: 123, title: 'Test Post', body: 'Content' },
      value: 'Content',
      field: { name: 'body', type: 'PgText', config: {} },
      user: { sub: 'user-1', role: 'admin' },
      csrfToken: 'test-csrf-token',
      sourceToken: 'plugin:puck.12345.test-signature',
      basePath: '/admin',
      requestUrl: 'http://localhost/admin/editor-plugin/posts/123/body',
      method: 'GET',
      params: { table: 'posts', id: '123', column: 'body' },
    };

    const html = await executor.executeRouteRender(
      'editor-plugin',
      'render:editor',
      context,
    );

    // Worker should return HTML containing context info
    assertEquals(typeof html, 'string');
    assertEquals(html.includes('<!DOCTYPE html>'), true);
    assertEquals(html.includes('Rendered by Worker'), true);
    assertEquals(html.includes('render:editor'), true);
    assertEquals(html.includes('posts'), true);
    assertEquals(html.includes('123'), true);
    assertEquals(html.includes('body'), true);
  } finally {
    executor.terminate();
  }
});

Deno.test('WorkerExecutor: executeRouteRender throws on invalid response', async () => {
  const errors: Error[] = [];
  const executor = new WorkerExecutor((err) => errors.push(err));
  const worker = createTestWorker();

  const plugin: RegisteredPlugin = {
    plugin: {
      name: 'bad-render-plugin',
      worker,
      hooks: { on: ['create'] },
    },
    initialized: false,
    isWorker: true,
  };

  await executor.initPlugin(plugin);

  const context = {
    table: 'test',
    recordId: '1',
    column: undefined,
    record: {},
    value: undefined,
    field: undefined,
    user: undefined,
    csrfToken: 'test',
    sourceToken: 'plugin:bad-render.12345.test-signature',
    basePath: '/admin',
    requestUrl: 'http://localhost/admin/test',
    method: 'GET',
    params: {},
  };

  // Use 'invalid-response' render type which returns { notHtml: ... } instead of { html: ... }
  await assertRejects(
    async () => {
      await executor.executeRouteRender(
        'bad-render-plugin',
        'invalid-response',
        context,
      );
    },
    Error,
    'returned invalid response',
  );

  // Verify error was reported via onError callback
  assertEquals(errors.length, 1);
  assert(errors[0]?.message.includes('returned invalid response'));

  executor.terminate();
});

Deno.test('WorkerExecutor: executeRouteRender with minimal context', async () => {
  const executor = new WorkerExecutor();
  const worker = createTestWorker();
  const plugin = createRegisteredPlugin('minimal-plugin', worker);

  try {
    await executor.initPlugin(plugin);

    // Minimal context - no table/record info (dashboard-style route)
    const context = {
      table: '',
      recordId: '',
      column: undefined,
      record: {},
      value: undefined,
      field: undefined,
      user: { sub: 'user-1' },
      csrfToken: 'csrf-token',
      sourceToken: 'plugin:minimal.12345.test-signature',
      basePath: '/admin',
      requestUrl: 'http://localhost/admin/minimal-plugin/dashboard',
      method: 'GET',
      params: {},
    };

    const html = await executor.executeRouteRender(
      'minimal-plugin',
      'render:dashboard',
      context,
    );

    assertEquals(typeof html, 'string');
    assertEquals(html.includes('<!DOCTYPE html>'), true);
    assertEquals(html.includes('render:dashboard'), true);
  } finally {
    executor.terminate();
  }
});
