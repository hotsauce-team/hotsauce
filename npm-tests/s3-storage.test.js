/**
 * E2E tests for @hotsauce/plugins-s3-storage in Node.js
 *
 * The plugin is pure fetch + Web Crypto (no runtime forks), so this is a
 * light smoke suite: it validates the npm build's entry points resolve, the
 * cross-package imports survived dnt, and SigV4 signing produces identical
 * output on Node's WebCrypto. Not meant to replace the Deno unit tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createS3StoragePlugin,
  validatePresignRequest,
} from '@hotsauce/plugins-s3-storage';
import { presignUrl } from '@hotsauce/plugins-s3-storage/signing';

function makePlugin(extra = {}) {
  return createS3StoragePlugin({
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    bucket: 'test-bucket',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    urlStyle: 'path',
    basePath: '/admin',
    ...extra,
  });
}

describe('@hotsauce/plugins-s3-storage (Node)', () => {
  it('factory instantiates with a storage provider and routes', () => {
    const plugin = makePlugin();
    assert.equal(plugin.name, 's3-storage');
    assert.ok(plugin.storageProvider);
    assert.ok(Array.isArray(plugin.routes) && plugin.routes.length > 0);
  });

  it('presign validation accepts */* inside an accept list', () => {
    // Regression for the inline-matcher bug fixed in issue #89.
    const result = validatePresignRequest(
      { filename: 'photo.png', contentType: 'image/png', size: 1000 },
      { file: { accept: 'application/pdf,*/*' } },
    );
    assert.equal(result, null);
  });

  it('presign validation rejects a non-matching content type', () => {
    const result = validatePresignRequest(
      { filename: 'doc.pdf', contentType: 'application/pdf', size: 1000 },
      { file: { accept: 'image/*' } },
    );
    assert.ok(result);
    assert.match(result.error, /Invalid file type/);
  });

  it('presignUrl reproduces the AWS SigV4 example vector', async () => {
    // Same fixed-date request as the Deno sigv4 tests; the signature must be
    // byte-identical on Node's WebCrypto.
    const url = await presignUrl({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expirySeconds: 86400,
      date: new Date('2013-05-24T00:00:00.000Z'),
    });
    assert.equal(
      new URL(url).searchParams.get('X-Amz-Signature'),
      'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signDownloadUrl builds encoded CDN URLs and rejects traversal keys', async () => {
    const provider = makePlugin({
      cdnBaseUrl: 'https://cdn.example.com/',
    }).storageProvider;

    assert.equal(
      await provider.signDownloadUrl({
        storage: 's3',
        key: 'media/file/1/a b.png',
      }),
      'https://cdn.example.com/media/file/1/a%20b.png',
    );

    await assert.rejects(
      provider.signDownloadUrl({
        storage: 's3',
        key: 'media/file/1/../../etc/passwd',
      }),
      /Invalid storage key/,
    );
  });
});
