/**
 * E2E tests for @hotsauce/plugins-fs-storage in Node.js
 *
 * The disk adapter (`createDiskFsAdapter`) feature-detects its runtime and uses
 * `node:fs/promises` when Deno is absent. The Deno test suite only ever
 * exercises the Deno branch, so these tests cover the **Node** branch against
 * real files on disk. Not meant to replace the Deno unit tests — just to
 * validate the npm build and the Node filesystem path.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDiskFsAdapter } from '@hotsauce/plugins-fs-storage';

describe('@hotsauce/plugins-fs-storage disk adapter (Node)', () => {
  const dirs = [];
  async function freshDir() {
    const dir = await mkdtemp(join(tmpdir(), 'hotsauce-fs-'));
    dirs.push(dir);
    return dir;
  }

  after(async () => {
    await Promise.all(
      dirs.map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  it('put / get / delete / list round-trip on real disk', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await fs.put('posts/image/1/a.bin', bytes);
    await fs.put('posts/image/2/b.bin', new Uint8Array([9]));

    // Round-trips through the adapter ...
    assert.deepEqual(await fs.get('posts/image/1/a.bin'), bytes);
    // ... and the bytes are actually on disk under rootDir.
    const onDisk = await readFile(join(dir, 'posts/image/1/a.bin'));
    assert.deepEqual(new Uint8Array(onDisk), bytes);

    const listed = await fs.list('posts/image/1/');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].key, 'posts/image/1/a.bin');
    assert.equal(listed[0].size, 4);

    await fs.delete('posts/image/1/a.bin');
    assert.equal((await fs.list('posts/image/1/')).length, 0);
    await assert.rejects(() => stat(join(dir, 'posts/image/1/a.bin')));
    // Deleting a missing key is a no-op.
    await fs.delete('posts/image/1/a.bin');
  });

  it('list() lists real keys and ignores the in-flight staging dir', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);

    // A legitimate upload whose on-disk name *ends* in a UUID-shaped `.tmp-`
    // suffix — the shape the old name-anchored skip wrongly dropped from
    // listings (so orphan-GC never saw it). It must now be listed.
    const trickyKey = `posts/image/1/data.tmp-${crypto.randomUUID()}`;
    await fs.put(trickyKey, new Uint8Array([1]));
    await fs.put('posts/image/1/real.bin', new Uint8Array([2, 3]));

    // Simulate an in-flight atomic put left in the dedicated staging dir.
    await mkdir(join(dir, '.uploads-tmp'), { recursive: true });
    await writeFile(
      join(dir, '.uploads-tmp', crypto.randomUUID()),
      new Uint8Array([9, 9, 9]),
    );

    const keys = (await fs.list('posts/image/1/')).map((e) => e.key).sort();
    assert.deepEqual(keys, ['posts/image/1/real.bin', trickyKey].sort());

    // A full listing (prefix '') also excludes the staging dir's contents.
    const allKeys = (await fs.list('')).map((e) => e.key);
    assert.equal(allKeys.some((k) => k.includes('.uploads-tmp')), false);
    assert.deepEqual(
      allKeys.sort(),
      ['posts/image/1/real.bin', trickyKey].sort(),
    );
  });

  it('put() sweeps temps orphaned by an earlier crash', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);
    const exists = (p) => lstat(p).then(() => true).catch(() => false);
    await mkdir(join(dir, '.uploads-tmp'), { recursive: true });

    // A temp left by a crashed upload, aged past the 1h TTL.
    const stale = join(dir, '.uploads-tmp', crypto.randomUUID());
    await writeFile(stale, new Uint8Array([9]));
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(stale, old, old);

    // A fresh temp from a concurrent in-flight upload — must be left alone.
    const fresh = join(dir, '.uploads-tmp', crypto.randomUUID());
    await writeFile(fresh, new Uint8Array([7]));

    // Any put triggers the (throttled) sweep.
    await fs.put('posts/image/1/real.bin', new Uint8Array([1, 2]));

    assert.equal(await exists(stale), false); // reclaimed
    assert.equal(await exists(fresh), true); // too new to touch
    assert.deepEqual(
      (await fs.list('posts/image/1/')).map((e) => e.key),
      ['posts/image/1/real.bin'],
    );
  });
});
