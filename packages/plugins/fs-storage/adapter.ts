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
  /** Write bytes for `key`, creating parent directories as needed. */
  put(key: string, data: Uint8Array): Promise<void>;
  /** Read bytes for `key`. Rejects if the key does not exist. */
  get(key: string): Promise<Uint8Array>;
  /** Delete `key`. A missing key is not an error. */
  delete(key: string): Promise<void>;
  /** List objects whose key starts with `prefix`. */
  list(
    prefix: string,
  ): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
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
    put(key, data) {
      assertSafeKey(key);
      store.set(key, { data: new Uint8Array(data), lastModified: new Date() });
      return Promise.resolve();
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

  return {
    async put(key, data) {
      const path = keyToPath(rootDir, key);
      await ensureDir(parentDir(path));
      const tmp = `${path}.tmp-${crypto.randomUUID()}`;
      if (Deno) {
        await Deno.writeFile(tmp, data);
        await Deno.rename(tmp, path);
      } else {
        const fs = await nodeFs();
        await fs.writeFile(tmp, data);
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
