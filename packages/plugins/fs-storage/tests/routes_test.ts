/**
 * Filesystem Storage Plugin Tests
 *
 * Most cases inject the in-memory {@link FileSystemAdapter} and stay
 * runtime-agnostic. The `disk adapter` / `routes (disk)` cases additionally
 * exercise the real {@link createDiskFsAdapter} against actual files on disk,
 * writing into uniquely-named temp dirs under `./tests/.tmp` — the single
 * directory the test permission group (`deno.jsonc` → `test.permissions.write`)
 * grants write access to. (The disk adapter's Node `node:fs/promises` branch is
 * covered separately by `npm-tests/fs-storage.test.js`.)
 *
 * Covers:
 * - Upload request validation (size / accept / content-type cross-check)
 * - Key safety (path-traversal guard)
 * - In-memory and on-disk adapter behaviour
 * - Signed token round-trip, expiry, tampering
 * - Provider methods (presignUpload, signDownloadUrl, delete, list)
 * - Route handlers end-to-end (presign → _upload → _serve), in-memory and on-disk
 */

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from '@std/assert';
import type { PluginRouteContext } from '@hotsauce/cms';
import type { FileSystemAdapter } from '../types.ts';
import {
  assertSafeKey,
  createDiskFsAdapter,
  createFsStoragePlugin,
  createMemoryFsAdapter,
  keyToPath,
  signToken,
  validatePresignRequest,
  verifyToken,
} from '../mod.ts';

const SECRET = 'test-signing-secret-at-least-16-chars';

// Scratch root for disk-adapter tests. The test permission group grants write
// access to exactly this directory (see deno.jsonc → test.permissions.write).
const TMP_ROOT = `${import.meta.dirname}/.tmp`;

/**
 * Run `fn` with a fresh, uniquely-named temp directory under {@link TMP_ROOT},
 * removing it afterwards. Each test gets its own dir so the suite stays safe to
 * run with `--parallel`.
 */
async function withDiskDir(fn: (dir: string) => Promise<void>): Promise<void> {
  // Created on demand so the scratch dir is not checked into the repo.
  await Deno.mkdir(TMP_ROOT, { recursive: true });
  const dir = await Deno.makeTempDir({ dir: TMP_ROOT });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** A single-chunk byte stream, as the upload route now consumes its body. */
function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
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

function makePlugin(
  adapter: FileSystemAdapter = createMemoryFsAdapter(),
  extra = {},
) {
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

Deno.test('validatePresignRequest: */* inside an accept list matches any type', () => {
  const result = validatePresignRequest(
    { filename: 'photo.png', contentType: 'image/png', size: 1000 },
    { file: { accept: 'application/pdf,*/*' } },
  );
  assertEquals(result, null);
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

Deno.test('assertSafeKey: rejects percent-encoding', () => {
  // Encoded separators/dot-segments a URL consumer might decode into traversal.
  assertThrows(
    () => assertSafeKey('posts/%2e%2e%2fetc/passwd'),
    Error,
    'percent',
  );
  assertThrows(() => assertSafeKey('posts/a%2fb'), Error, 'percent');
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

Deno.test('createDiskFsAdapter: rejects a filesystem- or drive-root rootDir', () => {
  // POSIX roots collapse to an empty base; Windows drive/UNC roots would map
  // keys onto the drive root. All are rejected.
  for (const root of ['/', '///', 'C:\\', 'C:', 'C:/', '\\\\']) {
    assertThrows(() => createDiskFsAdapter(root), Error, 'root');
  }
  // A real subdirectory (POSIX or Windows) is accepted.
  createDiskFsAdapter('/var/data');
  createDiskFsAdapter('C:\\uploads');
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

/** A multi-chunk byte stream, to exercise the streaming write path. */
function multiChunkStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

Deno.test('memory adapter: put accepts a stream and concatenates chunks', async () => {
  const fs = createMemoryFsAdapter();
  await fs.put(
    'posts/image/1/a.bin',
    multiChunkStream([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]),
    { expectedSize: 5 },
  );
  assertEquals(
    await fs.get('posts/image/1/a.bin'),
    new Uint8Array([1, 2, 3, 4, 5]),
  );
});

Deno.test('memory adapter: put rejects a stream that misses expectedSize, committing nothing', async () => {
  const fs = createMemoryFsAdapter();
  await assertRejects(
    () =>
      fs.put('posts/image/1/a.bin', streamOf(new Uint8Array([1, 2, 3])), {
        expectedSize: 5,
      }),
    Error,
    'Size mismatch',
  );
  assertEquals((await fs.list('posts/image/1/')).length, 0);
});

// ─────────────────────────────────────────────────────────────
// Disk adapter (real filesystem I/O under a temp dir)
// ─────────────────────────────────────────────────────────────

Deno.test('disk adapter: put streams to disk and enforces expectedSize', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);

    // A multi-chunk stream lands as a single contiguous file.
    await fs.put(
      'posts/image/1/a.bin',
      multiChunkStream([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
      { expectedSize: 5 },
    );
    assertEquals(
      await Deno.readFile(keyToPath(dir, 'posts/image/1/a.bin')),
      new Uint8Array([1, 2, 3, 4, 5]),
    );

    // A size mismatch rejects and leaves nothing behind — not even a temp file.
    await assertRejects(
      () =>
        fs.put('posts/image/2/b.bin', streamOf(new Uint8Array([9])), {
          expectedSize: 4,
        }),
      Error,
      'Size mismatch',
    );
    assertEquals((await fs.list('posts/image/2/')).length, 0);
    // No leftover temp files under the dir for the rejected key.
    assertEquals((await fs.list('posts/image/2')).length, 0);
  });
});

// NOTE: symlink-containment escape/toggle cases live in
// npm-tests/fs-storage.test.js — Deno.symlink requires unscoped fs
// permissions the test harness withholds, while Node creates symlinks freely
// (and that also covers the Node realpath branch). The disk tests here all run
// with containment ON by default, so they cover the non-escape realpath path.

Deno.test('disk adapter: rejects keys under the reserved staging dir', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);

    // A key inside .uploads-tmp would be hidden from list() and reaped by the
    // stale-temp sweeper — reserved for staging, so every method rejects it.
    for (const key of ['.uploads-tmp', '.uploads-tmp/evil.bin']) {
      await assertRejects(
        () => fs.put(key, new Uint8Array([1])),
        Error,
        'reserved',
      );
      await assertRejects(() => fs.get(key), Error, 'reserved');
      await assertRejects(() => fs.delete(key), Error, 'reserved');
    }

    // A merely dot-prefixed sibling is still a legal key.
    await fs.put('.uploads/ok.bin', new Uint8Array([1]));
    assertEquals((await fs.list('.uploads/')).length, 1);
  });
});

Deno.test('disk adapter: sequential puts both commit (memoized temp dir)', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);

    // The staging dir is created once and memoized; a second put must reuse
    // it and still land both files under their final keys.
    await fs.put('posts/image/1/a.bin', new Uint8Array([1, 2]));
    await fs.put('posts/image/1/b.bin', streamOf(new Uint8Array([3, 4, 5])), {
      expectedSize: 3,
    });

    assertEquals(
      await Deno.readFile(keyToPath(dir, 'posts/image/1/a.bin')),
      new Uint8Array([1, 2]),
    );
    assertEquals(
      await Deno.readFile(keyToPath(dir, 'posts/image/1/b.bin')),
      new Uint8Array([3, 4, 5]),
    );

    // Out-of-band deletion of the staging dir (tmp reaper, operator cleanup)
    // must not wedge the adapter: the interrupted put fails, but the memo is
    // dropped so the next put recreates the dir and succeeds.
    await Deno.remove(`${dir}/.uploads-tmp`, { recursive: true });
    await assertRejects(() =>
      fs.put('posts/image/1/c.bin', new Uint8Array([6]))
    );
    await fs.put('posts/image/1/c.bin', new Uint8Array([6]));
    assertEquals(
      await Deno.readFile(keyToPath(dir, 'posts/image/1/c.bin')),
      new Uint8Array([6]),
    );
  });
});

Deno.test('disk adapter: put / get / delete / list round-trip', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await fs.put('posts/image/1/a.bin', bytes);
    await fs.put('posts/image/2/b.bin', new Uint8Array([9]));

    // Bytes round-trip through the adapter ...
    assertEquals(await fs.get('posts/image/1/a.bin'), bytes);
    // ... and actually landed on disk under rootDir.
    assertEquals(
      await Deno.readFile(keyToPath(dir, 'posts/image/1/a.bin')),
      bytes,
    );

    const listed = await fs.list('posts/image/1/');
    assertEquals(listed.length, 1);
    assertEquals(listed[0]!.key, 'posts/image/1/a.bin');
    assertEquals(listed[0]!.size, 4);

    await fs.delete('posts/image/1/a.bin');
    assertEquals((await fs.list('posts/image/1/')).length, 0);
    // The file is gone from disk too.
    await assertRejects(() => Deno.stat(keyToPath(dir, 'posts/image/1/a.bin')));
    // Deleting a missing key is a no-op.
    await fs.delete('posts/image/1/a.bin');
  });
});

Deno.test('disk adapter: getStream yields the bytes and exact size', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await fs.put('posts/image/1/a.bin', bytes);

    const { stream, size } = await fs.getStream!('posts/image/1/a.bin');
    assertEquals(size, bytes.length);
    // Drain the stream and confirm it reproduces the file exactly.
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of chunks) {
      joined.set(c, off);
      off += c.length;
    }
    assertEquals(joined, bytes);

    // A missing key rejects (the route maps that to 404).
    await assertRejects(() => fs.getStream!('posts/image/1/missing.bin'));
  });
});

Deno.test('disk adapter: list() lists real keys and ignores the in-flight staging dir', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);
    // A legitimate upload whose on-disk name *ends* in a UUID-shaped `.tmp-`
    // suffix. The old name-anchored skip dropped exactly this shape from
    // listings (so orphan-GC never saw it); it must now be listed.
    const trickyKey = `posts/image/1/data.tmp-${crypto.randomUUID()}`;
    await fs.put(trickyKey, new Uint8Array([1]));
    await fs.put('posts/image/1/real.bin', new Uint8Array([2, 3]));

    // Simulate an in-flight atomic put left in the dedicated staging dir.
    const base = dir.replace(/\/+$/, '');
    await Deno.mkdir(`${base}/.uploads-tmp`, { recursive: true });
    await Deno.writeFile(
      `${base}/.uploads-tmp/${crypto.randomUUID()}`,
      new Uint8Array([9, 9, 9]),
    );

    const keys = (await fs.list('posts/image/1/')).map((e) => e.key).sort();
    assertEquals(keys, ['posts/image/1/real.bin', trickyKey].sort());

    // A full listing (prefix '') also excludes the staging dir's contents.
    const allKeys = (await fs.list('')).map((e) => e.key);
    assertEquals(allKeys.some((k) => k.includes('.uploads-tmp')), false);
    assertEquals(allKeys.sort(), ['posts/image/1/real.bin', trickyKey].sort());
  });
});

Deno.test('disk adapter: put() sweeps temps orphaned by an earlier crash', async () => {
  await withDiskDir(async (dir) => {
    const fs = createDiskFsAdapter(dir);
    const base = dir.replace(/\/+$/, '');
    await Deno.mkdir(`${base}/.uploads-tmp`, { recursive: true });
    const exists = (p: string) =>
      Deno.lstat(p).then(() => true).catch(() => false);

    // A temp left by a crashed upload, aged past the 1h TTL.
    const stale = `${base}/.uploads-tmp/${crypto.randomUUID()}`;
    await Deno.writeFile(stale, new Uint8Array([9]));
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await Deno.utime(stale, old, old);

    // A fresh temp from a concurrent in-flight upload — must be left alone.
    const fresh = `${base}/.uploads-tmp/${crypto.randomUUID()}`;
    await Deno.writeFile(fresh, new Uint8Array([7]));

    // Any put triggers the (throttled) sweep.
    await fs.put('posts/image/1/real.bin', new Uint8Array([1, 2]));

    assertEquals(await exists(stale), false); // reclaimed
    assertEquals(await exists(fresh), true); // too new to touch
    assertEquals(
      (await fs.list('posts/image/1/')).map((e) => e.key),
      ['posts/image/1/real.bin'],
    );
  });
});

Deno.test('routes (disk): presign → _upload writes real bytes → _serve streams them', async () => {
  await withDiskDir(async (dir) => {
    const { plugin } = makePlugin(createDiskFsAdapter(dir));
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
    const uploadUrl = 'http://localhost' + presignJson.upload.url;

    // 2. Upload
    const uploadRoute = findRoute(plugin, '_upload', 'POST');
    const uploadRes = await uploadRoute.handler(makeCtx({
      method: 'POST',
      requestUrl: uploadUrl,
      contentType: 'image/png',
      bodyStream: streamOf(fileBytes),
    })) as Response;
    assertEquals(uploadRes.status, 200);

    // Bytes were written to a real file under rootDir.
    assertEquals(
      await Deno.readFile(keyToPath(dir, presignJson.key)),
      fileBytes,
    );

    // 3. Serve reads them back off disk.
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
    const served = new Uint8Array(await serveRes.arrayBuffer());
    assertEquals(served, fileBytes);
  });
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

Deno.test('provider.signDownloadUrl: rejects a traversal key even with publicBaseUrl', async () => {
  // Core's isValidFileKey is prefix-only, so a tampered persisted key could
  // still carry `..` segments — signDownloadUrl must refuse to link it.
  const { plugin } = makePlugin(createMemoryFsAdapter(), {
    publicBaseUrl: 'https://cdn.example.com/files',
  });
  await assertRejects(
    () =>
      plugin.storageProvider!.signDownloadUrl!({
        storage: 'fs',
        key: 'posts/image/42/../../../etc/passwd',
        filename: 'passwd',
      }),
    Error,
    'unsafe segment',
  );
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

  // 2. Upload (raw bytes streamed to the signed _upload route)
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const uploadRes = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: uploadUrl,
    contentType: 'image/png',
    bodyStream: streamOf(fileBytes),
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
    bodyStream: streamOf(new Uint8Array([1])),
  })) as Response;
  assertEquals(res.status, 403);
});

// NOTE: early-reject cancellation of the unread body stream is owned by
// dispatch now — covered in packages/cms/tests/plugin_route_body_size_test.ts.

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
    contentType: 'image/png',
    bodyStream: streamOf(new Uint8Array([1, 2, 3])),
  })) as Response;
  assertEquals(res.status, 400);
});

Deno.test('routes: _upload rejects a Content-Type that does not match the token', async () => {
  const fs = createMemoryFsAdapter();
  const { plugin } = makePlugin(fs);
  const token = await signToken({
    kind: 'upload',
    table: 'posts',
    column: 'image',
    recordId: '42',
    key: 'posts/image/42/x.png',
    size: 3,
    contentType: 'image/png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const res = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: 'http://localhost/admin/fs-storage/_upload?token=' +
      encodeURIComponent(token),
    // The request declares a different type than the token bound.
    contentType: 'text/html',
    bodyStream: streamOf(new Uint8Array([1, 2, 3])),
  })) as Response;
  assertEquals(res.status, 415);
  // Nothing was written.
  assertEquals((await fs.list('')).length, 0);
});

Deno.test('routes: _upload accepts a Content-Type with parameters (charset)', async () => {
  // The client may send `text/plain; charset=utf-8`; only the essence must
  // match the token's `text/plain`.
  const fs = createMemoryFsAdapter();
  const { plugin } = makePlugin(fs);
  const token = await signToken({
    kind: 'upload',
    table: 'posts',
    column: 'doc',
    recordId: '42',
    key: 'posts/doc/42/x.txt',
    size: 3,
    contentType: 'text/plain',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const res = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: 'http://localhost/admin/fs-storage/_upload?token=' +
      encodeURIComponent(token),
    contentType: 'text/plain; charset=utf-8',
    bodyStream: streamOf(new Uint8Array([1, 2, 3])),
  })) as Response;
  assertEquals(res.status, 200);
});

Deno.test('routes: _upload maps a BodyTooLargeError to 413', async () => {
  // Simulate the cms `capStream` erroring the body mid-flight once it exceeds
  // the route's maxBodySize: `put` rejects with a `BodyTooLargeError`. This
  // exercises the name-based 413 branch in the `_upload` handler, which the
  // adapter-level (`SizeMismatchError`/success) and cms-level (catch-all 413)
  // tests never reach.
  const oversizing: FileSystemAdapter = {
    ...createMemoryFsAdapter(),
    put() {
      const err = new Error('body exceeded the cap');
      err.name = 'BodyTooLargeError';
      return Promise.reject(err);
    },
  };
  const { plugin } = makePlugin(oversizing);
  const token = await signToken({
    kind: 'upload',
    table: 'posts',
    column: 'image',
    recordId: '42',
    key: 'posts/image/42/x.png',
    size: 3,
    contentType: 'image/png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const uploadRoute = findRoute(plugin, '_upload', 'POST');
  const res = await uploadRoute.handler(makeCtx({
    method: 'POST',
    requestUrl: 'http://localhost/admin/fs-storage/_upload?token=' +
      encodeURIComponent(token),
    contentType: 'image/png',
    bodyStream: streamOf(new Uint8Array([1, 2, 3])),
  })) as Response;
  assertEquals(res.status, 413);
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

Deno.test('routes: _serve handles a non-ASCII filename without throwing', async () => {
  // A header value built by raw interpolation throws a `TypeError` (header
  // values are ByteStrings) for any code unit > 0xFF, permanently 500-ing the
  // download of an ordinarily-named file. `contentDispositionHeader` emits the
  // dual `filename` + `filename*=UTF-8''…` form instead.
  const { plugin, adapter } = makePlugin();
  await adapter.put('posts/image/42/x.png', new Uint8Array([1, 2, 3]));
  const token = await signToken({
    kind: 'download',
    key: 'posts/image/42/x.png',
    filename: '写真😀.png',
    exp: Math.floor(Date.now() / 1000) + 100,
  }, SECRET);
  const serveRoute = findRoute(plugin, '_serve', 'GET');
  const res = await serveRoute.handler(makeCtx({
    requestUrl: 'http://localhost/admin/fs-storage/_serve?token=' +
      encodeURIComponent(token),
  })) as Response;
  assertEquals(res.status, 200);
  const cd = res.headers.get('Content-Disposition') ?? '';
  assertStringIncludes(cd, 'attachment');
  assertStringIncludes(cd, "filename*=UTF-8''");
  assertEquals(
    new Uint8Array(await res.arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
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
