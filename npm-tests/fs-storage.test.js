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
  symlink,
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

  it('getStream yields the bytes and exact size (Node stream branch)', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await fs.put('posts/image/1/a.bin', bytes);

    const { stream, size } = await fs.getStream('posts/image/1/a.bin');
    assert.equal(size, bytes.length);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(new Uint8Array(Buffer.concat(chunks)), bytes);

    await assert.rejects(() => fs.getStream('posts/image/1/missing.bin'));
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

  // Symlink containment: exercised here (not in the Deno suite) because
  // Deno.symlink needs unscoped fs permissions the Deno test harness withholds,
  // whereas Node creates symlinks freely — and this covers the Node realpath
  // branch of assertContained.
  it('symlink containment blocks a key that resolves outside rootDir', async () => {
    const dir = await freshDir();
    const outside = await freshDir();
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET');
    // A symlink planted under rootDir pointing at a file outside it.
    await symlink(join(outside, 'secret.txt'), join(dir, 'escape.txt'));

    const fs = createDiskFsAdapter(dir); // containment on by default
    await assert.rejects(fs.get('escape.txt'), /outside rootDir/);
    await assert.rejects(fs.getStream('escape.txt'), /outside rootDir/);
  });

  it('delete() removes a planted escaping symlink but leaves its target', async () => {
    const dir = await freshDir();
    const outside = await freshDir();
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET');
    await symlink(join(outside, 'secret.txt'), join(dir, 'escape.txt'));

    const fs = createDiskFsAdapter(dir);
    // delete unlinks the link itself (safe) rather than following it — so the
    // planted link is removable and the outside target is untouched.
    await fs.delete('escape.txt');
    assert.equal(
      await lstat(join(dir, 'escape.txt')).then(() => false).catch(() => true),
      true,
    );
    assert.equal(
      await readFile(join(outside, 'secret.txt'), 'utf8'),
      'TOP SECRET',
    );
  });

  it('delete() still rejects a path that escapes via an intermediate directory symlink', async () => {
    const dir = await freshDir();
    const outside = await freshDir();
    await mkdir(join(outside, 'image', '1'), { recursive: true });
    await writeFile(join(outside, 'image', '1', 'victim.bin'), 'VICTIM');
    await symlink(outside, join(dir, 'posts')); // posts -> outside

    const fs = createDiskFsAdapter(dir);
    await assert.rejects(
      fs.delete('posts/image/1/victim.bin'),
      /outside rootDir/,
    );
    // The out-of-root victim was not deleted through the directory symlink.
    assert.equal(
      await readFile(join(outside, 'image', '1', 'victim.bin'), 'utf8'),
      'VICTIM',
    );
  });

  it('list() never enumerates a planted symlink as a key', async () => {
    const dir = await freshDir();
    const outside = await freshDir();
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET DATA');
    const fs = createDiskFsAdapter(dir);
    await fs.put('posts/image/1/real.bin', new Uint8Array([1, 2]));

    // A file symlink and a directory symlink, both escaping rootDir.
    await symlink(
      join(outside, 'secret.txt'),
      join(dir, 'posts/image/1/leak.bin'),
    );
    await symlink(outside, join(dir, 'posts/image/1/leakdir'));

    // Only the real key is listed — no phantom keys, no foreign metadata, and
    // walk() doesn't traverse out through the directory symlink.
    const keys = (await fs.list('posts/image/1/')).map((e) => e.key);
    assert.deepEqual(keys, ['posts/image/1/real.bin']);
    assert.deepEqual(
      (await fs.list('')).map((e) => e.key),
      ['posts/image/1/real.bin'],
    );
  });

  it('symlink containment can be turned off', async () => {
    const dir = await freshDir();
    const outside = await freshDir();
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET');
    await symlink(join(outside, 'secret.txt'), join(dir, 'escape.txt'));

    const fs = createDiskFsAdapter(dir, { symlinkContainment: false });
    // Off: the symlink is followed and the outside file leaks through.
    assert.equal(
      new TextDecoder().decode(await fs.get('escape.txt')),
      'TOP SECRET',
    );
  });

  it('symlink containment allows links that stay inside rootDir', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);
    await fs.put('posts/image/1/real.bin', new Uint8Array([7, 8, 9]));
    // A symlink whose target is also under rootDir resolves cleanly.
    await symlink(
      join(dir, 'posts/image/1/real.bin'),
      join(dir, 'inside-link.bin'),
    );

    assert.deepEqual(
      await fs.get('inside-link.bin'),
      new Uint8Array([7, 8, 9]),
    );
  });
});
