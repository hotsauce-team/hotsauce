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
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

  it('list() ignores only in-flight .tmp-{uuid} writes', async () => {
    const dir = await freshDir();
    const fs = createDiskFsAdapter(dir);

    // A legitimate upload whose filename merely contains `.tmp-`.
    await fs.put('posts/image/1/report.tmp-old.pdf', new Uint8Array([1]));
    await fs.put('posts/image/1/real.bin', new Uint8Array([2, 3]));

    // Simulate a partially-written atomic put left on disk.
    const stray = join(dir, 'posts/image/1/real.bin') +
      `.tmp-${crypto.randomUUID()}`;
    await writeFile(stray, new Uint8Array([9, 9, 9]));

    const keys = (await fs.list('posts/image/1/')).map((e) => e.key).sort();
    assert.deepEqual(keys, [
      'posts/image/1/real.bin',
      'posts/image/1/report.tmp-old.pdf',
    ]);
  });
});
