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
 * Most tests inject an in-memory adapter (`createMemoryFsAdapter`) so they stay
 * runtime-agnostic, but the suite also includes scoped disk-adapter tests under
 * `packages/plugins/fs-storage/tests/.tmp` (see `deno.jsonc` test permissions).
 *
 * ## Key safety and symlink containment
 *
 * Two layers keep an operation from touching a file outside `rootDir`:
 *
 * 1. **Textual key validation** (`assertSafeKey`, always on): rejects absolute
 *    paths, backslashes, control chars, and `.`/`..`/empty segments before a
 *    key becomes a path. This alone can't stop a *symlink* planted under
 *    `rootDir` — a symlink is a legitimate path with no `..` in it.
 * 2. **Symlink containment** (`symlinkContainment`, default on): resolves real
 *    paths (`realpath`) and refuses operations that escape `rootDir`. The check
 *    is asymmetric by necessity, because the two kinds of operation follow
 *    symlinks differently:
 *    - **Reads** (`get`/`getStream`) *follow* the final component to read it, so
 *      they resolve the **full key path** and reject any escape.
 *    - **Writes/removes** (`put`/`delete`) do **not** follow the final
 *      component — `rename` replaces it and `remove` unlinks it — so they
 *      resolve only the **parent** container. An escape via an intermediate
 *      directory symlink is still rejected; a final-segment symlink is replaced
 *      (`put`) or unlinked (`delete`) in place, so a planted link is removable
 *      without its outside target ever being written or read.
 *    - **`list`** skips symlinked entries entirely — the adapter only ever
 *      creates regular files and real directories, so a symlink is never a key
 *      it produced.
 *
 * Containment is not TOCTOU-proof and is opt-out; see SECURITY.md for the
 * deployment guidance (dedicated `rootDir`, OS-level isolation for multi-tenant).
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
  /**
   * Open `key` as a byte stream (plus its total `size` for `Content-Length`),
   * so a download can be piped straight to the response without buffering the
   * whole file in memory. Rejects if the key does not exist.
   *
   * Optional: callers must fall back to {@link FileSystemAdapter.get} when an
   * adapter doesn't implement it.
   */
  getStream?(
    key: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }>;
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
  // Reject percent-encoding. Keys are minted from a restricted charset and
  // never contain '%'. On disk `%2f`/`%2e` are literal characters (the path is
  // not URL-decoded), but the `publicBaseUrl` static-serve branch embeds the
  // key in a URL a proxy/CDN may decode into a separator or dot-segment
  // (%2f -> '/', %2e -> '.') — smuggling traversal past the literal checks
  // below. Reject the encoded form at the source, matching s3-storage.
  if (key.includes('%')) {
    throw new Error(`Invalid storage key: percent-encoding in "${key}"`);
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
    getStream(key) {
      assertSafeKey(key);
      const entry = store.get(key);
      if (!entry) {
        return Promise.reject(new Error(`Not found: ${key}`));
      }
      const bytes = entry.data;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return Promise.resolve({ stream, size: bytes.length });
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
/** Options for {@link createDiskFsAdapter}. */
export interface DiskFsAdapterOptions {
  /**
   * Resolve each key's real filesystem path (following symlinks) and reject it
   * if it escapes `rootDir`. `assertSafeKey` blocks textual traversal (`..`,
   * absolute paths), but a symlink planted under `rootDir` by another process
   * would otherwise let a key read or write outside it. Costs one extra
   * `realpath` syscall per `get`/`getStream`/`delete`/`put`.
   *
   * Leave this on unless `rootDir` is a directory your application exclusively
   * controls AND you legitimately place symlinks inside it. Not TOCTOU-proof
   * (a symlink swapped in after the check still wins); for hard multi-tenant
   * isolation prefer an OS sandbox (a dedicated mount, container, or
   * `RESOLVE_BENEATH`). See SECURITY.md.
   *
   * @default true
   */
  symlinkContainment?: boolean;
}

export function createDiskFsAdapter(
  rootDir: string,
  opts: DiskFsAdapterOptions = {},
): FileSystemAdapter {
  const Deno = denoNs();
  const symlinkContainment = opts.symlinkContainment ?? true;

  // Trim trailing separators, forward and back (Windows accepts both).
  const base = rootDir.replace(/[/\\]+$/, '');
  // Reject a root that maps keys onto a filesystem/drive root rather than a
  // dedicated subdirectory — POSIX '/'/'//' (→ ''), or a Windows drive/UNC
  // root like 'C:\', 'C:', 'C:/', or '\\'. Otherwise a key would resolve to
  // `${root}/${key}` at the very top of a volume: without containment it writes
  // there silently, and with it operations fail later with a confusing
  // realPath NotFound. `base` is what remains after trailing separators are
  // stripped, so a root-only value is an optional drive letter plus separators.
  if (/^([a-zA-Z]:)?[/\\]*$/.test(base)) {
    throw new Error(
      'fs-storage: rootDir must not be a filesystem or drive root; use a dedicated subdirectory.',
    );
  }
  // In-flight uploads are written here, not beside their final path, so a temp
  // file can never collide with (or be mistaken for) a real key. The leading
  // dot is a segment the key sanitizer never produces, so `list()` can skip it
  // by name. See `assertSafeKey` / `generateObjectKey`.
  const TEMP_DIRNAME = '.uploads-tmp';
  const tempDir = `${base}/${TEMP_DIRNAME}`;

  // A staged temp is normally renamed into place (or `removeQuietly`'d on a
  // handled failure) within a single `put`. The only way one survives is a hard
  // crash/kill between the write and the rename; such a file is then invisible
  // to orphan-GC (it lives outside any record prefix and `list()` skips this
  // dir). A staged temp older than this is therefore certainly abandoned and
  // safe to delete — the window is generous so it can never race a slow
  // in-flight upload.
  const TEMP_TTL_MS = 60 * 60 * 1000; // 1 hour
  // Throttle the opportunistic sweep to at most once per TTL per adapter
  // instance (the adapter is normally long-lived, built once at startup).
  let lastSweepAt = 0;

  /**
   * `keyToPath` plus this adapter's reserved-name rule: a key must not point
   * into the staging dir. `assertSafeKey` allows a leading-dot segment, but a
   * key under {@link TEMP_DIRNAME} would be hidden from `list()` and — worse —
   * deleted by {@link sweepStaleTemps}, which assumes everything there is an
   * orphaned temp. (CMS-minted keys always start with a table name, so this
   * only guards direct adapter API use.)
   */
  function resolveKeyPath(key: string): string {
    const path = keyToPath(rootDir, key);
    if (key === TEMP_DIRNAME || key.startsWith(`${TEMP_DIRNAME}/`)) {
      throw new Error(
        `Invalid storage key: "${TEMP_DIRNAME}" is reserved for upload staging`,
      );
    }
    return path;
  }

  function isMissing(err: unknown): boolean {
    const name = (err as { name?: string })?.name;
    const code = (err as { code?: string })?.code;
    return name === 'NotFound' || code === 'ENOENT';
  }

  async function realPath(p: string): Promise<string> {
    if (Deno) return await Deno.realPath(p);
    return await (await nodeFs()).realpath(p);
  }

  // `realPath` normalizes its output to the OS path separator, so the
  // containment prefix check below must use that separator — on Windows a
  // contained path (`C:\root\x`) would otherwise fail `startsWith('C:\root/')`
  // and every operation would be rejected. Detected via the feature-detected
  // runtime, like the I/O calls above.
  const nodeProcess =
    (globalThis as unknown as { process?: { platform?: string } }).process;
  const isWindows = Deno
    ? Deno.build?.os === 'windows'
    : nodeProcess?.platform === 'win32';
  const pathSep = isWindows ? '\\' : '/';

  // `rootDir` may itself be a symlink (e.g. /var/data -> /mnt/vol); resolve it
  // once so containment compares real paths to real paths. Memoized like the
  // temp dir; a failure (base not created yet) is not cached. The resolved
  // base is held for the adapter's lifetime, so if `rootDir` is repointed to a
  // new target while the process runs, restart to pick it up — otherwise
  // containment compares against the stale target and rejects valid keys.
  let realBaseReady: Promise<string> | null = null;
  function ensureRealBase(): Promise<string> {
    realBaseReady ??= realPath(base).catch((err) => {
      realBaseReady = null;
      throw err;
    });
    return realBaseReady;
  }

  /**
   * Resolve `path` and assert its real location stays within `rootDir`, so a
   * symlink under `rootDir` can't redirect a key outside it. A missing path is
   * left for the caller's own operation to report (preserving NotFound /
   * idempotent-delete semantics). No-op when `symlinkContainment` is off.
   */
  async function assertContained(path: string): Promise<void> {
    if (!symlinkContainment) return;
    let real: string;
    try {
      real = await realPath(path);
    } catch (err) {
      if (isMissing(err)) return; // the real op will surface the missing path
      throw err;
    }
    const realBase = await ensureRealBase();
    if (real !== realBase && !real.startsWith(`${realBase}${pathSep}`)) {
      throw new Error(
        `Invalid storage key: resolves outside rootDir (symlink escape)`,
      );
    }
  }

  async function ensureDir(dir: string): Promise<void> {
    if (Deno) {
      await Deno.mkdir(dir, { recursive: true });
    } else {
      const fs = await nodeFs();
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // `tempDir` is fixed for the adapter's lifetime, so create it once and
  // memoize (like `nodeFsPromise` above) instead of paying a recursive mkdir
  // on every upload. A failure is not memoized: the first upload before
  // `rootDir` exists must not poison every later one.
  let tempDirReady: Promise<void> | null = null;
  function ensureTempDir(): Promise<void> {
    tempDirReady ??= ensureDir(tempDir)
      // Staged bytes are written here before the rename, so verify the staging
      // dir itself isn't a symlink escaping rootDir (checked once per memo).
      .then(() => assertContained(tempDir))
      .catch((err) => {
        tempDirReady = null;
        throw err;
      });
    return tempDirReady;
  }

  /**
   * The memo above never re-checks the staging dir, so an out-of-band
   * deletion (tmp reaper, operator cleanup) would otherwise fail every later
   * upload with ENOENT. On a not-found failure, drop the memo so the next
   * `put` recreates the dir. (The failing upload itself can't be retried —
   * a streamed body is already consumed by then.)
   */
  function resetTempDirIfLost(err: unknown): void {
    const name = (err as { name?: string })?.name;
    const code = (err as { code?: string })?.code;
    if (name === 'NotFound' || code === 'ENOENT') {
      tempDirReady = null;
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

  /**
   * Delete staged temp files older than {@link TEMP_TTL_MS} — the only temps
   * that outlive their `put` are those orphaned by a hard crash mid-write, and
   * nothing else ever reclaims them. Best-effort and fault-tolerant: a missing
   * dir or a file that vanishes mid-sweep is ignored.
   */
  async function sweepStaleTemps(): Promise<void> {
    let names: string[];
    try {
      if (Deno) {
        names = [];
        for await (const e of Deno.readDir(tempDir)) names.push(e.name);
      } else {
        const fs = await nodeFs();
        names = await fs.readdir(tempDir);
      }
    } catch {
      return; // no staging dir yet, or unreadable — nothing to sweep
    }
    const cutoff = Date.now() - TEMP_TTL_MS;
    await Promise.all(names.map(async (name) => {
      const p = `${tempDir}/${name}`;
      try {
        const st = Deno ? await Deno.stat(p) : await (await nodeFs()).stat(p);
        // A null mtime (some virtual/network filesystems) means the age is
        // unknown — keep the temp rather than risk sweeping an in-flight one.
        if ((st.mtime?.getTime() ?? Infinity) < cutoff) await removeQuietly(p);
      } catch { /* vanished between readdir and stat — ignore */ }
    }));
  }

  return {
    async put(key, data, opts) {
      const path = resolveKeyPath(key);
      // The parent dir varies per key; the memoized temp-dir creation runs
      // concurrently instead of serializing a second awaited mkdir on it.
      await Promise.all([ensureDir(parentDir(path)), ensureTempDir()]);

      // The final path doesn't exist yet, so check its (now-created) parent: if
      // a symlink under rootDir redirected it outside, reject before writing any
      // bytes. This runs after ensureDir, so a pre-planted intermediate
      // directory symlink means the recursive mkdir will already have created
      // empty dirs at the symlink's target — but no file content is ever
      // committed there, no data is read, and triggering it requires write
      // access under rootDir (to plant the symlink) plus process write
      // permission at the target. Checking before mkdir would need a walk up to
      // the deepest existing ancestor (extra syscalls per upload) to avoid only
      // that empty-dir side effect, which isn't worth it.
      await assertContained(parentDir(path));

      // Opportunistically reclaim temps orphaned by an earlier crashed upload
      // (throttled). Runs before the new temp is created, so it never targets
      // the write we're about to make.
      if (Date.now() - lastSweepAt >= TEMP_TTL_MS) {
        lastSweepAt = Date.now();
        await sweepStaleTemps();
      }

      const tmp = `${tempDir}/${crypto.randomUUID()}`;

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
          resetTempDirIfLost(err);
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
          resetTempDirIfLost(err);
          await removeQuietly(tmp);
          throw err;
        }
      }

      // Commit. If the rename itself fails (ENOSPC on the metadata op, EPERM, a
      // concurrently-removed parent, a locked target on Windows), clean up the
      // temp file so it isn't orphaned in `tempDir`.
      try {
        if (Deno) {
          await Deno.rename(tmp, path);
        } else {
          const fs = await nodeFs();
          await fs.rename(tmp, path);
        }
      } catch (err) {
        resetTempDirIfLost(err);
        await removeQuietly(tmp);
        throw err;
      }
    },

    async get(key) {
      const path = resolveKeyPath(key);
      await assertContained(path);
      if (Deno) {
        return await Deno.readFile(path);
      }
      const fs = await nodeFs();
      const buf = await fs.readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },

    async getStream(key) {
      const path = resolveKeyPath(key);
      await assertContained(path);
      if (Deno) {
        // `Deno.open` rejects if the file is missing; the returned `readable`
        // closes the fd when the body is fully read or cancelled.
        const file = await Deno.open(path, { read: true });
        const { size } = await file.stat();
        return { stream: file.readable, size };
      }
      const fs = await nodeFs();
      // stat first so a missing file rejects *before* we hand back a stream
      // (createReadStream would otherwise only error asynchronously).
      const { size } = await fs.stat(path);
      // deno-lint-ignore no-explicit-any
      const { createReadStream } = await import('node:fs') as any;
      // deno-lint-ignore no-explicit-any
      const { Readable } = await import('node:stream') as any;
      const stream = Readable.toWeb(
        createReadStream(path),
      ) as ReadableStream<Uint8Array>;
      return { stream, size };
    },

    async delete(key) {
      const path = resolveKeyPath(key);
      // Removing an entry (like renaming onto it in `put`) doesn't follow a
      // final-segment symlink — remove/rm unlink the link itself, leaving its
      // target untouched — so only the parent container must stay within
      // rootDir. Checking the fully-resolved path (as get/getStream do, since
      // they *read through* the link) would instead reject a planted escaping
      // symlink and leave it un-removable. An intermediate directory symlink
      // still escapes the parent check and is rejected.
      await assertContained(parentDir(path));
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
      const results: Array<
        { key: string; size: number; lastModified: Date }
      > = [];

      // Walk only the subtree that could contain `prefix`. For the common
      // orphan-cleanup prefix (`table/column/id/`) this descends straight to
      // that directory instead of scanning the whole `rootDir` tree. A prefix
      // with no trailing slash keeps its last (partial) segment as a leaf
      // filter via the `startsWith` check below.
      const slash = prefix.lastIndexOf('/');
      const startRel = slash >= 0 ? prefix.slice(0, slash) : '';

      async function walk(relDir: string): Promise<void> {
        const absDir = relDir ? `${base}/${relDir}` : base;
        let entries: Array<
          { name: string; isDir: boolean; isSymlink: boolean }
        >;
        try {
          if (Deno) {
            entries = [];
            for await (const e of Deno.readDir(absDir)) {
              entries.push({
                name: e.name,
                isDir: e.isDirectory,
                isSymlink: e.isSymlink,
              });
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
              isSymlink: d.isSymbolicLink(),
            }));
          }
        } catch (err) {
          const name = (err as { name?: string })?.name;
          const code = (err as { code?: string })?.code;
          if (name === 'NotFound' || code === 'ENOENT') return;
          throw err;
        }

        for (const entry of entries) {
          // Never descend into the in-flight upload staging dir — temp files
          // there are not real keys.
          if (!relDir && entry.name === TEMP_DIRNAME) continue;
          // The adapter only ever creates regular files (write+rename) and real
          // directories (mkdir), so a symlink is never a key it produced. Skip
          // it unconditionally: enumerating one would `stat`-follow it and
          // report a foreign target's size/mtime as a key, and feed orphan-GC a
          // phantom it can't reclaim. (Independent of `symlinkContainment`,
          // which governs whether get/delete *follow* a caller-named key.)
          if (entry.isSymlink) continue;
          const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
          if (entry.isDir) {
            await walk(childRel);
          } else if (childRel.startsWith(prefix)) {
            const absPath = `${base}/${childRel}`;
            // deno-lint-ignore no-explicit-any
            let st: any;
            try {
              st = Deno
                ? await Deno.stat(absPath)
                : await (await nodeFs()).stat(
                  absPath,
                );
            } catch (err) {
              // The file vanished between the directory read and its stat (e.g.
              // a concurrent record delete or orphan cleanup). Skip it rather
              // than failing the whole listing.
              const name = (err as { name?: string })?.name;
              const code = (err as { code?: string })?.code;
              if (name === 'NotFound' || code === 'ENOENT') continue;
              throw err;
            }
            results.push({
              key: childRel,
              size: st.size,
              lastModified: st.mtime ?? new Date(0),
            });
          }
        }
      }

      await walk(startRel);
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
