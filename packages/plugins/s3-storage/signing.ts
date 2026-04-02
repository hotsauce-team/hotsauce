/**
 * S3 URL signing utilities for use outside the CMS handler.
 *
 * Use these to generate presigned download URLs in your own routes
 * (e.g., public file serving) without depending on CMS internals.
 *
 * @example
 * ```ts
 * import { buildObjectUrl, presignUrl } from '@hotsauce/plugins/s3-storage/signing';
 *
 * const objectUrl = buildObjectUrl(endpoint, bucket, fileRef.key, 'path');
 * const signedUrl = await presignUrl({
 *   method: 'GET',
 *   url: objectUrl,
 *   region: 'us-east-1',
 *   accessKeyId,
 *   secretAccessKey,
 *   expirySeconds: 900,
 * });
 * ```
 *
 * @module
 */

export { buildObjectUrl, presignUrl } from './sigv4.ts';
export type { PresignOptions } from './sigv4.ts';
