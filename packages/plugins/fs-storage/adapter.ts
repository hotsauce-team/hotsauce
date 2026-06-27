/**
 * Filesystem adapter for the fs-storage plugin.
 *
 * The plugin is storage-key oriented: keys look like
 * `{table}/{column}/{recordId}/{uuid}-{filename}` (see `@hotsauce/core`'s
 * `getFileKeyPrefix`). The adapter maps those keys onto a directory tree under
 * `rootDir` and performs the actual byte I/O.
 *
 * ## Runtime strategy
 *
 * Per project conventions (`AGENTS.md`: "NO `Deno.*` IN PACKAGES … Web Standard
 * APIs only"), runtime filesystem access is **feature-detected** at call time
 * rather than imported statically. This mirrors `getEnv()` in
 * `packages/cms/runtime-compat.ts`, which detects `globalThis.Deno` vs
 * `globalThis.process`. The default adapter works on Deno and Node 20+ without
 * either runtime being a compile-time dependency.
 *
 * Tests inject an in-memory adapter (`createMemoryFsAdapter`) so they stay
 * runtime-agnostic and never touch disk — important because the project's test
 * permissions grant no filesystem write access.
 *
 * @module
 */

/**
 * Pluggable filesystem backend.
 *
 * All methods operate on storage **keys** (POSIX-style, relative). The default
 * adapter maps keys onto `rootDir`; an in-memory adapter keeps them in a `Map`.
 */
export interface FileSystemAdapter {
  /**
   * Write bytes for `key`, creating parent directories as needed.
   *
   * `data` may be a `Uint8Array` or a byte `ReadableStream` (streamed straight
   * to storage without buffering the whole payload). When `opts.expectedSize`
   * is given, the write is rejected — and nothing is committed under `key` — if
   * the actual byte count differs, so callers can bind an upload to an exact
   * size without re-reading it.
   */
  put(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array>,
    opts?: PutOptions,
  ): Promise<void>;
  /** Read bytes for `key`. Rejects if the key does not exist. */
  get(key: string): Promise<Uint8Array>;
  /** Delete `key`. A missing key is not an error. */
  delete(key: string): Promise<void>;
  /** List objects whose key starts with `prefix`. */
  list(
    prefix: string,
  ): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
}

/** Options for {@link FileSystemAdapter.put}. */
export interface PutOptions {
  /**
   * Exact expected byte length. If the data's actual size differs, `put`
   * rejects and commits nothing under the key.
   */
  expectedSize?: number;
}

/**
 * A `TransformStream` that tallies bytes flowing through it. Place it before a
 * runtime write so the byte count is known once the write resolves, without a
 * second pass or a `stat`.
 */
function countingTransform(): {
  stream: TransformStream<Uint8Array, Uint8Array>;
  getCount: () => number;
} {
  let count = 0;
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      count += chunk.length;
      controller.enqueue(chunk);
    },
  });
  return { stream, getCount: () => count };
}

/** Drain a byte stream into a single `Uint8Array`. */
async function drainStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Thrown by {@link FileSystemAdapter.put} when the data's actual byte count
 * doesn't match a supplied `expectedSize`. Carries a stable `name` so callers
 * can map it to a client error (e.g. `400`) without importing the class.
 */
export class SizeMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Size mismatch: expected ${expected} bytes, received ${actual}`);
    this.name = 'SizeMismatchError';
  }
}

/** Throw a {@link SizeMismatchError} if `actual` doesn't match `expectedSize`. */
function assertExpectedSize(actual: number, expected?: number): void {
  if (expected !== undefined && actual !== expected) {
    throw new SizeMismatchError(expected, actual);
  }
}

// ─────────────────────────────────────────────────────────────
// Key safety
// ─────────────────────────────────────────────────────────────

/**
 * Validate that a storage key is safe to map onto a filesystem path.
 *
 * `isValidFileKey` (core) checks that a key carries the right
 * `{table}/{column}/{recordId}/` prefix, but it does NOT guard against on-disk
 * path traversal. This does: it rejects absolute paths, backslashes, `.`/`..`
 * segments, empty segments, and control characters — so a tampered or malicious
 * key can never escape `rootDir`.
 *
 * @throws Error if the key is unsafe.
 */
export function assertSafeKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Invalid storage key: empty');
  }
  // No absolute paths, no Windows drive letters, no backslashes.
  if (key.startsWith('/') || key.startsWith('\\') || /^[a-zA-Z]:/.test(key)) {
    throw new Error(`Invalid storage key: absolute path "${key}"`);
  }
  if (key.includes('\\')) {
    throw new Error(`Invalid storage key: backslash in "${key}"`);
  }
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) {
    throw new Error('Invalid storage key: control character');
  }
  const segments = key.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(`Invalid storage key: unsafe segment in "${key}"`);
    }
  }
}

/**
 * Resolve a key to an absolute-ish disk path under `rootDir`.
 * Validates the key first (throws on traversal) so the result is always
 * contained within `rootDir`.
 */
export function keyToPath(rootDir: string, key: string): string {
  assertSafeKey(key);
  const base = rootDir.replace(/\/+$/, '');
  return `${base}/${key}`;
}

// ─────────────────────────────────────────────────────────────
// In-memory adapter (tests, ephemeral storage)
// ─────────────────────────────────────────────────────────────

/**
 * In-memory {@link FileSystemAdapter}. Bytes live in a `Map` keyed by storage
 * key. Used by tests (no disk access) and usable for ephemeral storage.
 *
 * Still enforces {@link assertSafeKey}, so traversal attempts are rejected the
 * same way the on-disk adapter rejects them.
 */
export function createMemoryFsAdapter(
  initial?: Map<string, { data: Uint8Array; lastModified: Date }>,
): FileSystemAdapter & {
  store: Map<string, { data: Uint8Array; lastModified: Date }>;
} {
  const store = initial ??
    new Map<string, { data: Uint8Array; lastModified: Date }>();
  return {
    store,
    async put(key, data, opts) {
      assertSafeKey(key);
      const bytes = data instanceof Uint8Array
        ? new Uint8Array(data)
        : await drainStream(data);
      assertExpectedSize(bytes.length, opts?.expectedSize);
      store.set(key, { data: bytes, lastModified: new Date() });
    },
    get(key) {
      assertSafeKey(key);
      const entry = store.get(key);
      if (!entry) {
        return Promise.reject(new Error(`Not found: ${key}`));
      }
      return Promise.resolve(entry.data);
    },
    delete(key) {
      assertSafeKey(key);
      store.delete(key);
      return Promise.resolve();
    },
    list(prefix) {
      const results: Array<{ key: string; size: number; lastModified: Date }> =
        [];
      for (const [key, entry] of store) {
        if (key.startsWith(prefix)) {
          results.push({
            key,
            size: entry.data.length,
            lastModified: entry.lastModified,
          });
        }
      }
      return Promise.resolve(results);
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Default adapter (feature-detected disk I/O)
// ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function denoNs(): any {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).Deno;
}

/** Lazily import node:fs/promises (Node 20+ / Bun). */
// deno-lint-ignore no-explicit-any
let nodeFsPromise: Promise<any> | null = null;
// deno-lint-ignore no-explicit-any
function nodeFs(): Promise<any> {
  nodeFsPromise ??= import('node:fs/promises');
  return nodeFsPromise;
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

/**
 * Default filesystem adapter backed by real disk I/O, feature-detecting the
 * host runtime (Deno or Node 20+/Bun). Writes are atomic
 * (write-to-temp-then-rename) so a half-written file is never visible under its
 * final key. Listing walks the directory tree under `rootDir`.
 *
 * The caller (the user's server) is responsible for granting the runtime
 * read/write permission to `rootDir`.
 */
export function createDiskFsAdapter(rootDir: string): FileSystemAdapter {
  const Deno = denoNs();

  async function ensureDir(dir: string): Promise<void> {
    if (Deno) {
      await Deno.mkdir(dir, { recursive: true });
    } else {
      const fs = await nodeFs();
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /** Best-effort removal of a temp file (ignores "not found"). */
  async function removeQuietly(path: string): Promise<void> {
    try {
      if (Deno) {
        await Deno.remove(path);
      } else {
        const fs = await nodeFs();
        await fs.rm(path, { force: true });
      }
    } catch { /* temp may never have been created */ }
  }

  return {
    async put(key, data, opts) {
      const path = keyToPath(rootDir, key);
      await ensureDir(parentDir(path));
      const tmp = `${path}.tmp-${crypto.randomUUID()}`;

      // Fast path: bytes already in hand — verify size before writing.
      if (data instanceof Uint8Array) {
        assertExpectedSize(data.length, opts?.expectedSize);
        try {
          if (Deno) {
            await Deno.writeFile(tmp, data);
          } else {
            const fs = await nodeFs();
            await fs.writeFile(tmp, data);
          }
        } catch (err) {
          await removeQuietly(tmp);
          throw err;
        }
      } else {
        // Stream path: pipe to the temp file while counting bytes, so the body
        // is never fully buffered. The temp file is removed on any failure
        // (oversize/abort mid-stream, or a size mismatch) so a half-written or
        // wrong-sized file is never committed under `key`.
        const { stream: counter, getCount } = countingTransform();
        const counted = data.pipeThrough(counter);
        try {
          if (Deno) {
            await Deno.writeFile(tmp, counted);
          } else {
            const fs = await nodeFs();
            // deno-lint-ignore no-explicit-any
            const { Readable } = await import('node:stream') as any;
            await fs.writeFile(tmp, Readable.fromWeb(counted));
          }
          assertExpectedSize(getCount(), opts?.expectedSize);
        } catch (err) {
          await removeQuietly(tmp);
          throw err;
        }
      }

      if (Deno) {
        await Deno.rename(tmp, path);
      } else {
        const fs = await nodeFs();
        await fs.rename(tmp, path);
      }
    },

    async get(key) {
      const path = keyToPath(rootDir, key);
      if (Deno) {
        return await Deno.readFile(path);
      }
      const fs = await nodeFs();
      const buf = await fs.readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },

    async delete(key) {
      const path = keyToPath(rootDir, key);
      try {
        if (Deno) {
          await Deno.remove(path);
        } else {
          const fs = await nodeFs();
          await fs.rm(path, { force: true });
        }
      } catch (err) {
        // Missing file is not an error (idempotent delete).
        const name = (err as { name?: string })?.name;
        const code = (err as { code?: string })?.code;
        if (name === 'NotFound' || code === 'ENOENT') return;
        throw err;
      }
    },

    async list(prefix) {
      assertSafeKeyPrefix(prefix);
      const base = rootDir.replace(/\/+$/, '');
      const results: Array<
        { key: string; size: number; lastModified: Date }
      > = [];

      async function walk(relDir: string): Promise<void> {
        const absDir = relDir ? `${base}/${relDir}` : base;
        let entries: Array<{ name: string; isDir: boolean }>;
        try {
          if (Deno) {
            entries = [];
            for await (const e of Deno.readDir(absDir)) {
              entries.push({ name: e.name, isDir: e.isDirectory });
            }
          } else {
            const fs = await nodeFs();
            // deno-lint-ignore no-explicit-any
            const dirents: any[] = await fs.readdir(absDir, {
              withFileTypes: true,
            });
            entries = dirents.map((d) => ({
              name: d.name,
              isDir: d.isDirectory(),
            }));
          }
        } catch (err) {
          const name = (err as { name?: string })?.name;
          const code = (err as { code?: string })?.code;
          if (name === 'NotFound' || code === 'ENOENT') return;
          throw err;
        }

        for (const entry of entries) {
          // Skip partial writes still in flight. Anchor to the actual temp
          // suffix (`.tmp-${crypto.randomUUID()}`) so a legitimate upload whose
          // filename merely contains `.tmp-` isn't silently dropped from listings.
          if (
            /\.tmp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
              .test(entry.name)
          ) {
            continue;
          }
          const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
          if (entry.isDir) {
            await walk(childRel);
          } else if (childRel.startsWith(prefix)) {
            const absPath = `${base}/${childRel}`;
            let size = 0;
            let lastModified = new Date(0);
            if (Deno) {
              const st = await Deno.stat(absPath);
              size = st.size;
              lastModified = st.mtime ?? new Date(0);
            } else {
              const fs = await nodeFs();
              const st = await fs.stat(absPath);
              size = st.size;
              lastModified = st.mtime ?? new Date(0);
            }
            results.push({ key: childRel, size, lastModified });
          }
        }
      }

      await walk('');
      return results;
    },
  };
}

/**
 * Validate a listing prefix. Prefixes are not full keys (they may end with `/`
 * and have no filename segment) but must still not escape `rootDir`.
 */
function assertSafeKeyPrefix(prefix: string): void {
  if (prefix.startsWith('/') || prefix.includes('\\')) {
    throw new Error(`Invalid prefix: "${prefix}"`);
  }
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f]/.test(prefix)) {
    throw new Error('Invalid prefix: control character');
  }
  for (const segment of prefix.split('/')) {
    if (segment === '..' || segment === '.') {
      throw new Error(`Invalid prefix: unsafe segment in "${prefix}"`);
    }
  }
}
