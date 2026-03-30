/**
 * Storage Registry and File Serving Tests
 */

import { assertEquals, assertExists } from '@std/assert';

// Test FileReference fallback rules
Deno.test('FileReference fallback: data present means db storage', () => {
  // When FileReference has `data` but no `storage`, treat as 'db'
  const ref = {
    filename: 'test.txt',
    contentType: 'text/plain',
    size: 100,
    data: 'base64data',
  } as { data?: string; url?: string; key?: string; storage?: string };

  // Fallback rule: data exists → 'db' storage
  const storage = ref.data ? 'db' : undefined;
  assertEquals(storage, 'db');
});

Deno.test('FileReference fallback: url present means public storage', () => {
  // When FileReference has `url` but no `storage`, treat as 'public'
  const ref = {
    filename: 'test.txt',
    contentType: 'text/plain',
    size: 100,
    url: 'https://cdn.example.com/test.txt',
  } as { data?: string; url?: string; key?: string; storage?: string };

  // Fallback rule: url exists (no data) → 'public' storage
  const storage = !ref.data && ref.url ? 'public' : undefined;
  assertEquals(storage, 'public');
});

Deno.test('FileReference fallback: key present uses default provider', () => {
  // When FileReference has `key` but no `storage`, use defaultObjectStorageId
  const ref = {
    filename: 'test.txt',
    contentType: 'text/plain',
    size: 100,
    key: 'uploads/test.txt',
  } as { data?: string; url?: string; key?: string; storage?: string };

  const defaultObjectStorageId = 's3';

  // Fallback rule: key exists (no data, no url) → default storage
  const storage = !ref.data && !ref.url && ref.key
    ? defaultObjectStorageId
    : undefined;
  assertEquals(storage, 's3');
});

Deno.test('FileReference: explicit storage takes precedence', () => {
  // When FileReference has explicit `storage`, use it
  const ref = {
    filename: 'test.txt',
    contentType: 'text/plain',
    size: 100,
    key: 'uploads/test.txt',
    storage: 'r2',
  };

  // Explicit storage takes precedence
  const defaultObjectStorageId = 's3';
  const storage = ref.storage ?? defaultObjectStorageId;
  assertEquals(storage, 'r2');
});

// Test storage registry building
Deno.test('buildStorageRegistry: extracts providers from plugins', () => {
  // Simulate the registry building logic
  const plugins = [
    {
      name: 's3-plugin',
      storageProvider: {
        id: 's3',
        kind: 's3' as const,
        presignUpload: () =>
          Promise.resolve({
            key: '',
            upload: { method: 'PUT', url: '' },
          }),
      },
    },
    {
      name: 'r2-plugin',
      storageProvider: {
        id: 'r2',
        kind: 's3' as const,
        presignUpload: () =>
          Promise.resolve({
            key: '',
            upload: { method: 'PUT', url: '' },
          }),
      },
    },
  ];

  const instances = new Map();
  for (const plugin of plugins) {
    if (plugin.storageProvider) {
      instances.set(plugin.storageProvider.id, plugin.storageProvider);
    }
  }

  assertEquals(instances.size, 2);
  assertEquals(instances.has('s3'), true);
  assertEquals(instances.has('r2'), true);
});

Deno.test('buildStorageRegistry: rejects duplicate provider IDs', () => {
  const plugins = [
    {
      name: 'plugin-1',
      storageProvider: { id: 's3', kind: 's3' as const },
    },
    {
      name: 'plugin-2',
      storageProvider: { id: 's3', kind: 's3' as const }, // Duplicate
    },
  ];

  const instances = new Map();
  let error: Error | null = null;

  for (const plugin of plugins) {
    if (plugin.storageProvider) {
      if (instances.has(plugin.storageProvider.id)) {
        error = new Error(
          `Storage provider "${plugin.storageProvider.id}" already registered`,
        );
        break;
      }
      instances.set(plugin.storageProvider.id, plugin.storageProvider);
    }
  }

  assertExists(error);
  assertEquals(error!.message.includes('already registered'), true);
});

// Test storage resolution
Deno.test('resolveStorage: uses callback when provided', () => {
  const resolveStorage = (ctx: { table: string }) => {
    return ctx.table === 'backups' ? 'archive' : 's3';
  };

  assertEquals(resolveStorage({ table: 'posts' }), 's3');
  assertEquals(resolveStorage({ table: 'backups' }), 'archive');
});

Deno.test('resolveStorage: falls back to default when no callback', () => {
  const defaultObjectStorageId = 's3';
  const resolveStorage: undefined | ((ctx: { table: string }) => string) =
    undefined;

  // When no resolver, use default
  const storage = resolveStorage ??
    ((_ctx: { table: string }) => defaultObjectStorageId);
  assertEquals(storage({ table: 'posts' }), 's3');
});

// Test per-column storage routing
Deno.test('resolveStorage: routes by column for mixed DB/S3 storage', () => {
  const resolveStorage = (ctx: { table: string; column: string }) => {
    // Route specific columns to DB storage (return undefined)
    if (ctx.column === 'document') return undefined;
    // Everything else to S3
    return 's3';
  };

  assertEquals(resolveStorage({ table: 'media', column: 'thumbnail' }), 's3');
  assertEquals(
    resolveStorage({ table: 'media', column: 'document' }),
    undefined,
  );
});

// Test multiple S3 providers with different storageIds
Deno.test('buildStorageRegistry: supports multiple S3 providers', () => {
  const plugins = [
    {
      name: 'primary-storage',
      storageProvider: {
        id: 'primary', // Custom storageId
        kind: 's3' as const,
        presignUpload: () =>
          Promise.resolve({ key: '', upload: { method: 'PUT', url: '' } }),
      },
    },
    {
      name: 'archive-storage',
      storageProvider: {
        id: 'archive', // Different storageId
        kind: 's3' as const,
        presignUpload: () =>
          Promise.resolve({ key: '', upload: { method: 'PUT', url: '' } }),
      },
    },
  ];

  const instances = new Map();
  for (const plugin of plugins) {
    if (plugin.storageProvider) {
      instances.set(plugin.storageProvider.id, plugin.storageProvider);
    }
  }

  assertEquals(instances.size, 2);
  assertEquals(instances.has('primary'), true);
  assertEquals(instances.has('archive'), true);
  assertEquals(instances.get('primary')?.kind, 's3');
  assertEquals(instances.get('archive')?.kind, 's3');
});

Deno.test('resolveStorage: routes by table to different S3 providers', () => {
  const resolveStorage = (ctx: { table: string }) => {
    if (ctx.table === 'backups') return 'archive';
    if (ctx.table === 'thumbnails') return undefined; // DB
    return 'primary';
  };

  assertEquals(resolveStorage({ table: 'posts' }), 'primary');
  assertEquals(resolveStorage({ table: 'backups' }), 'archive');
  assertEquals(resolveStorage({ table: 'thumbnails' }), undefined);
});

// Test UIRenderFieldContext.storageId matching
Deno.test('renderField: only shows S3 link when storageId matches plugin', () => {
  // Simulate plugin renderField logic
  const pluginStorageId = 'primary';

  const shouldRender = (ctxStorageId: string | undefined) => {
    // Match the actual plugin logic
    return ctxStorageId === pluginStorageId;
  };

  // When storageId matches plugin, render
  assertEquals(shouldRender('primary'), true);

  // When storageId differs, don't render (let other plugin handle it)
  assertEquals(shouldRender('archive'), false);
  assertEquals(shouldRender('s3'), false);

  // When storageId undefined (DB storage), don't render
  assertEquals(shouldRender(undefined), false);
});
