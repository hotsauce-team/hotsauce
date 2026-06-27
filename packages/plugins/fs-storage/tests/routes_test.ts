/**
 * Filesystem Storage Plugin Tests
 *
 * Runtime-agnostic: an in-memory {@link FileSystemAdapter} is injected, so the
 * tests never touch disk (the project's test permissions grant no FS writes).
 *
 * Covers:
 * - Upload request validation (size / accept / content-type cross-check)
 * - Key safety (path-traversal guard)
 * - In-memory adapter behaviour
 * - Signed token round-trip, expiry, tampering
 * - Provider methods (presignUpload, signDownloadUrl, delete, list)
 * - Route handlers end-to-end (presign → _upload → _serve)
 */

import { assertEquals, assertStringIncludes, assertThrows } from '@std/assert';
import type { PluginRouteContext } from '@hotsauce/cms';
import {
  assertSafeKey,
  createFsStoragePlugin,
  createMemoryFsAdapter,
  keyToPath,
  signToken,
  validatePresignRequest,
  verifyToken,
} from '../mod.ts';

const SECRET = 'test-signing-secret-at-least-16-chars';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function makeCtx(
  overrides: Partial<PluginRouteContext> = {},
): PluginRouteContext {
  return {
    table: '',
    recordId: '',
    column: undefined,
    record: {},
    value: undefined,
    field: undefined,
    user: undefined,
    csrfToken: 'csrf',
    sourceToken: 'source',
    basePath: '/admin',
    requestUrl: 'http://localhost/admin/fs-storage/_x',
    method: 'GET',
    body: undefined,
    params: {},
    ...overrides,
  };
}

function makePlugin(adapter = createMemoryFsAdapter(), extra = {}) {
  const plugin = createFsStoragePlugin({
    basePath: '/admin',
    rootDir: './uploads',
    signingSecret: SECRET,
    fs: adapter,
    ...extra,
  });
  return { plugin, adapter };
}

// deno-lint-ignore no-explicit-any
function findRoute(plugin: any, pattern: string, method: string) {
  return plugin.routes.find(
    // deno-lint-ignore no-explicit-any
    (r: any) =>
      r.pattern === pattern && (r.methods ?? ['GET']).includes(method),
  );
}

// ─────────────────────────────────────────────────────────────
// validatePresignRequest
// ─────────────────────────────────────────────────────────────

Deno.test('validatePresignRequest: rejects file exceeding maxSize', () => {
  const result = validatePresignRequest(
    { filename: 'big.png', contentType: 'image/png', size: 5_000_000 },
    { file: { maxSize: 200_000 } },
  );
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'File too large');
  assertStringIncludes(result!.error, '195KB');
});

Deno.test('validatePresignRequest: default 10MB limit applies', () => {
  const result = validatePresignRequest(
    {
      filename: 'huge.bin',
      contentType: 'application/octet-stream',
      size: 11 * 1024 * 1024,
    },
    { file: true },
  );
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, '10MB');
});

Deno.test('validatePresignRequest: maxSize 0 disables size limit', () => {
  const result = validatePresignRequest(
    {
      filename: 'huge.bin',
      contentType: 'application/octet-stream',
      size: 500 * 1024 * 1024,
    },
    { file: { maxSize: 0 } },
  );
  assertEquals(result, null);
});

Deno.test('validatePresignRequest: rejects content-type mismatch', () => {
  const result = validatePresignRequest(
    { filename: 'malware.exe', contentType: 'image/png', size: 1000 },
    { file: true },
  );
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'Content type mismatch');
});

Deno.test('validatePresignRequest: rejects type not in accept list', () => {
  const result = validatePresignRequest(
    { filename: 'doc.pdf', contentType: 'application/pdf', size: 1000 },
    { file: { accept: 'image/*' } },
  );
  assertEquals(result !== null, true);
  assertStringIncludes(result!.error, 'Invalid file type');
});

Deno.test('validatePresignRequest: no config means no restrictions', () => {
  const result = validatePresignRequest(
    {
      filename: 'huge.bin',
      contentType: 'application/octet-stream',
      size: 999_999_999,
    },
    undefined,
  );
  assertEquals(result, null);
});

// ─────────────────────────────────────────────────────────────
// assertSafeKey / keyToPath
// ─────────────────────────────────────────────────────────────

Deno.test('assertSafeKey: accepts a normal storage key', () => {
  assertSafeKey('posts/image/42/abc-photo.png');
});

Deno.test('assertSafeKey: rejects traversal segments', () => {
  assertThrows(() => assertSafeKey('posts/../../etc/passwd'));
  assertThrows(() => assertSafeKey('../escape'));
  assertThrows(() => assertSafeKey('posts/./image'));
});

Deno.test('assertSafeKey: rejects absolute paths and backslashes', () => {
  assertThrows(() => assertSafeKey('/etc/passwd'));
  assertThrows(() => assertSafeKey('C:/windows'));
  assertThrows(() => assertSafeKey('posts\\image'));
  assertThrows(() => assertSafeKey(''));
});

Deno.test('keyToPath: maps a safe key under rootDir', () => {
  assertEquals(
    keyToPath('/var/data/', 'posts/image/42/x.png'),
    '/var/data/posts/image/42/x.png',
  );
});

Deno.test('keyToPath: throws on traversal before producing a path', () => {
  assertThrows(() => keyToPath('/var/data', 'posts/../../etc/passwd'));
});

// ─────────────────────────────────────────────────────────────
// In-memory adapter
// ─────────────────────────────────────────────────────────────

Deno.test('memory adapter: put / get / delete / list round-trip', async () => {
  const fs = createMemoryFsAdapter();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await fs.put('posts/image/1/a.bin', bytes);
  await fs.put('posts/image/2/b.bin', new Uint8Array([9]));

  assertEquals(await fs.get('posts/image/1/a.bin'), bytes);

  const listed = await fs.list('posts/image/1/');
  assertEquals(listed.length, 1);
  assertEquals(listed[0]!.key, 'posts/image/1/a.bin');
  assertEquals(listed[0]!.size, 4);

  await fs.delete('posts/image/1/a.bin');
  assertEquals((await fs.list('posts/image/1/')).length, 0);
  // Deleting a missing key is a no-op.
  await fs.delete('posts/image/1/a.bin');
});

// ─────────────────────────────────────────────────────────────
// Signed tokens
// ─────────────────────────────────────────────────────────────

Deno.test('signToken / verifyToken: upload token round-trips', async () => {
  const token = await signToken({
    kind: 'upload',
    table: 'posts',
    column: 'image',
    recordId: '42',
    key: 'posts/image/42/x.png',
    size: 123,
    contentType: 'image/png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);

  const payload = await verifyToken(token, SECRET, 'upload');
  assertEquals(payload?.key, 'posts/image/42/x.png');
  assertEquals(payload?.size, 123);
});

Deno.test('verifyToken: rejects expired token', async () => {
  const token = await signToken({
    kind: 'download',
    key: 'posts/image/42/x.png',
    exp: 1000,
  }, SECRET);
  // now is well past exp
  const payload = await verifyToken(token, SECRET, 'download', 2000);
  assertEquals(payload, null);
});

Deno.test('verifyToken: rejects wrong secret', async () => {
  const token = await signToken({
    kind: 'download',
    key: 'x',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  assertEquals(
    await verifyToken(token, 'a-different-secret-16+', 'download'),
    null,
  );
});

Deno.test('verifyToken: rejects kind mismatch', async () => {
  const token = await signToken({
    kind: 'download',
    key: 'x',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  assertEquals(await verifyToken(token, SECRET, 'upload'), null);
});

Deno.test('verifyToken: rejects tampered payload', async () => {
  const token = await signToken({
    kind: 'download',
    key: 'posts/image/42/x.png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const [, sig] = token.split('.');
  const forged = `${
    btoa('{"kind":"download","key":"secret/key","exp":9999999999}')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }.${sig}`;
  assertEquals(await verifyToken(forged, SECRET, 'download'), null);
});

// ─────────────────────────────────────────────────────────────
// Provider methods
// ─────────────────────────────────────────────────────────────

Deno.test('createFsStoragePlugin: throws without a usable signing secret', () => {
  assertThrows(() =>
    createFsStoragePlugin({
      basePath: '/admin',
      rootDir: './uploads',
      signingSecret: 'too-short',
      fs: createMemoryFsAdapter(),
    })
  );
});

Deno.test('provider.presignUpload: mints a token-signed upload URL', async () => {
  const { plugin } = makePlugin();
  const provider = plugin.storageProvider!;
  const result = await provider.presignUpload!({
    request: new Request('http://localhost/admin/fs-storage/posts/42/image'),
    user: null,
    table: 'posts',
    column: 'image',
    action: 'update',
    recordId: '42',
    filename: 'photo.png',
    contentType: 'image/png',
    size: 10,
  });

  assertStringIncludes(result.key, 'posts/image/42/');
  assertStringIncludes(result.key, 'photo.png');
  assertEquals(result.upload.method, 'POST');
  assertStringIncludes(result.upload.url, '/admin/fs-storage/_upload?token=');

  const token = new URL('http://x' + result.upload.url).searchParams.get(
    'token',
  )!;
  const payload = await verifyToken(token, SECRET, 'upload');
  assertEquals(payload?.key, result.key);
  assertEquals(payload?.size, 10);
});

Deno.test('provider.signDownloadUrl: uses publicBaseUrl when set', async () => {
  const { plugin } = makePlugin(createMemoryFsAdapter(), {
    publicBaseUrl: 'https://cdn.example.com/files',
  });
  const url = await plugin.storageProvider!.signDownloadUrl!({
    storage: 'fs',
    key: 'posts/image/42/x.png',
    filename: 'x.png',
  });
  assertEquals(url, 'https://cdn.example.com/files/posts/image/42/x.png');
});

Deno.test('provider.signDownloadUrl: builds absolute _serve URL from request origin', async () => {
  const { plugin } = makePlugin();
  const url = await plugin.storageProvider!.signDownloadUrl!({
    storage: 'fs',
    key: 'posts/image/42/x.png',
    filename: 'x.png',
    request: new Request('http://localhost:8000/admin/files/posts/image/42'),
  });
  assertStringIncludes(
    url,
    'http://localhost:8000/admin/fs-storage/_serve?token=',
  );
  const token = new URL(url).searchParams.get('token')!;
  const payload = await verifyToken(token, SECRET, 'download');
  assertEquals(payload?.key, 'posts/image/42/x.png');
});

Deno.test('provider.deleteObject / listObjects: adapter-backed', async () => {
  const fs = createMemoryFsAdapter();
  await fs.put('posts/image/42/a.png', new Uint8Array([1]));
  await fs.put('posts/image/42/b.png', new Uint8Array([2]));
  const { plugin } = makePlugin(fs);
  const provider = plugin.storageProvider!;

  const listed = await provider.listObjects!('posts/image/42/');
  assertEquals(listed.length, 2);

  await provider.deleteObject!({ storage: 'fs', key: 'posts/image/42/a.png' });
  assertEquals((await provider.listObjects!('posts/image/42/')).length, 1);
});

// ─────────────────────────────────────────────────────────────
// Route handlers end-to-end
// ─────────────────────────────────────────────────────────────

Deno.test('routes: presign → _upload writes bytes → _serve streams them', async () => {
  const fs = createMemoryFsAdapter();
  const { plugin } = makePlugin(fs);
  const fileBytes = new Uint8Array([10, 20, 30, 40, 50]);

  // 1. Presign
  const presignRoute = findRoute(plugin, ':table/:id/:column', 'POST');
  const presignRes = await presignRoute.handler(makeCtx({
    table: 'posts',
    recordId: '42',
    column: 'image',
    method: 'POST',
    field: { name: 'image', type: 'file', config: { file: true } },
    requestUrl: 'http://localhost/admin/fs-storage/posts/42/image',
    body: JSON.stringify({
      filename: 'photo.png',
      contentType: 'image/png',
      size: fileBytes.length,
    }),
    params: { table: 'posts', id: '42', column: 'image' },
  })) as Response;
  assertEquals(presignRes.status, 200);
  const presignJson = await presignRes.json();
  assertEquals(presignJson.storage, 'fs');
  const uploadUrl = 'http://localhost' + presignJson.upload.url;

  // 2. Upload (base64 JSON to the signed _upload route)
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const uploadRes = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: uploadUrl,
    body: JSON.stringify({ data: bytesToBase64(fileBytes) }),
  })) as Response;
  assertEquals(uploadRes.status, 200);

  // Bytes were written under the minted key.
  assertEquals(await fs.get(presignJson.key), fileBytes);

  // 3. Serve
  const serveUrl = await plugin.storageProvider!.signDownloadUrl!({
    storage: 'fs',
    key: presignJson.key,
    filename: 'photo.png',
    request: new Request('http://localhost/admin/files/posts/image/42'),
  });
  const serveRoute = findRoute(plugin, '_serve', 'GET');
  const serveRes = await serveRoute.handler(makeCtx({
    requestUrl: serveUrl,
  })) as Response;
  assertEquals(serveRes.status, 200);
  assertEquals(serveRes.headers.get('Content-Type'), 'image/png');
  assertStringIncludes(
    serveRes.headers.get('Content-Disposition') ?? '',
    'attachment',
  );
  assertEquals(serveRes.headers.get('X-Content-Type-Options'), 'nosniff');
  assertStringIncludes(
    serveRes.headers.get('Content-Security-Policy') ?? '',
    "script-src 'none'",
  );
  const served = new Uint8Array(await serveRes.arrayBuffer());
  assertEquals(served, fileBytes);
});

Deno.test('routes: presign 404s when the column is not a file field', async () => {
  const { plugin } = makePlugin();
  const presignRoute = findRoute(plugin, ':table/:id/:column', 'POST');
  const res = await presignRoute.handler(makeCtx({
    table: 'posts',
    recordId: '42',
    column: 'title',
    method: 'POST',
    // A non-file column: config has no `file` marker.
    field: { name: 'title', type: 'text', config: {} },
    requestUrl: 'http://localhost/admin/fs-storage/posts/42/title',
    body: JSON.stringify({
      filename: 'photo.png',
      contentType: 'image/png',
      size: 5,
    }),
    params: { table: 'posts', id: '42', column: 'title' },
  })) as Response;
  assertEquals(res.status, 404);
});

Deno.test('routes: presign rejects a file too large for the upload route', async () => {
  const { plugin } = makePlugin(createMemoryFsAdapter(), {
    maxUploadBytes: 1024,
  });
  const presignRoute = findRoute(plugin, ':table/:id/:column', 'POST');
  const res = await presignRoute.handler(makeCtx({
    table: 'posts',
    recordId: '42',
    column: 'image',
    method: 'POST',
    // maxSize 0 disables the per-column size check, so only the upload-route
    // body cap (maxUploadBytes) can reject it.
    field: { name: 'image', type: 'file', config: { file: { maxSize: 0 } } },
    requestUrl: 'http://localhost/admin/fs-storage/posts/42/image',
    body: JSON.stringify({
      filename: 'photo.png',
      contentType: 'image/png',
      size: 4096,
    }),
    params: { table: 'posts', id: '42', column: 'image' },
  })) as Response;
  assertEquals(res.status, 400);
  const json = await res.json();
  assertStringIncludes(json.error, 'upload route');
});

Deno.test('routes: upload page 404s when the column is not a file field', async () => {
  const { plugin } = makePlugin();
  const pageRoute = findRoute(plugin, ':table/:id/:column', 'GET');
  const res = await pageRoute.handler(makeCtx({
    table: 'posts',
    recordId: '42',
    column: 'title',
    field: { name: 'title', type: 'text', config: {} },
    requestUrl: 'http://localhost/admin/fs-storage/posts/42/title',
    params: { table: 'posts', id: '42', column: 'title' },
  })) as Response;
  assertEquals(res.status, 404);
});

Deno.test('createFsStoragePlugin: throws on empty rootDir without a custom adapter', () => {
  assertThrows(
    () =>
      createFsStoragePlugin({
        basePath: '/admin',
        rootDir: '   ',
        signingSecret: SECRET,
      }),
    Error,
    'rootDir is required',
  );
});

Deno.test('routes: _upload rejects an invalid token', async () => {
  const { plugin } = makePlugin();
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const res = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: 'http://localhost/admin/fs-storage/_upload?token=garbage',
    body: JSON.stringify({ data: bytesToBase64(new Uint8Array([1])) }),
  })) as Response;
  assertEquals(res.status, 403);
});

Deno.test('routes: _upload rejects a size mismatch', async () => {
  const { plugin } = makePlugin();
  const token = await signToken({
    kind: 'upload',
    table: 'posts',
    column: 'image',
    recordId: '42',
    key: 'posts/image/42/x.png',
    size: 999,
    contentType: 'image/png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const res = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: 'http://localhost/admin/fs-storage/_upload?token=' +
      encodeURIComponent(token),
    body: JSON.stringify({ data: bytesToBase64(new Uint8Array([1, 2, 3])) }),
  })) as Response;
  assertEquals(res.status, 400);
});

Deno.test('routes: _serve rejects an invalid token', async () => {
  const { plugin } = makePlugin();
  const serveRoute = findRoute(plugin, '_serve', 'GET');
  const res = await serveRoute.handler(makeCtx({
    requestUrl: 'http://localhost/admin/fs-storage/_serve?token=garbage',
  })) as Response;
  assertEquals(res.status, 403);
});

Deno.test('routes: _serve 404s when the file is missing', async () => {
  const { plugin } = makePlugin();
  const token = await signToken({
    kind: 'download',
    key: 'posts/image/42/missing.png',
    filename: 'missing.png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const serveRoute = findRoute(plugin, '_serve', 'GET');
  const res = await serveRoute.handler(makeCtx({
    requestUrl: 'http://localhost/admin/fs-storage/_serve?token=' +
      encodeURIComponent(token),
  })) as Response;
  assertEquals(res.status, 404);
});

Deno.test('routes: _assets serve embedded css and js', async () => {
  const { plugin } = makePlugin();
  const css = await (findRoute(plugin, '_assets/upload.css', 'GET')
    .handler(makeCtx()) as Response);
  assertStringIncludes(css.headers.get('Content-Type') ?? '', 'text/css');
  const js = await (findRoute(plugin, '_assets/upload.js', 'GET')
    .handler(makeCtx()) as Response);
  assertStringIncludes(
    js.headers.get('Content-Type') ?? '',
    'application/javascript',
  );
});
