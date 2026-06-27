/**
 * Filesystem Storage Plugin Types
 * @module
 */

import type { FileSystemAdapter } from './adapter.ts';

export type { FileSystemAdapter } from './adapter.ts';

/**
 * Configuration options for the filesystem storage plugin.
 *
 * Stores uploaded files on the local filesystem (or any injected
 * {@link FileSystemAdapter}) instead of an external object store. The plugin
 * serves bytes from the application server itself — no nginx/CDN required —
 * while still allowing a static file server to be put in front via
 * {@link FsStoragePluginOptions.publicBaseUrl}.
 *
 * @example
 * ```ts
 * // Self-hosted: the plugin serves files from disk via its own route.
 * createFsStoragePlugin({
 *   basePath: '/admin',
 *   rootDir: './uploads',
 *   signingSecret: process.env.CMS_CSRF_SECRET!,
 * });
 *
 * // Behind a static file server (nginx/caddy serving ./uploads at /files).
 * createFsStoragePlugin({
 *   basePath: '/admin',
 *   rootDir: './uploads',
 *   publicBaseUrl: 'https://cdn.example.com/files',
 *   signingSecret: process.env.CMS_CSRF_SECRET!,
 * });
 * ```
 */
export interface FsStoragePluginOptions {
  /**
   * Unique identifier for this storage provider instance.
   * Referenced by `FileReference.storage` and by `storage` routing.
   *
   * @default 'fs'
   */
  storageId?: string;

  /**
   * CMS base path (e.g., '/admin').
   * Required for generating upload-page, asset, upload and serve route URLs.
   */
  basePath: string;

  /**
   * Root directory on disk where files are stored.
   * Keys map to `{rootDir}/{table}/{column}/{recordId}/{uuid}-{filename}`.
   *
   * The host runtime must have read/write permission to this directory.
   * Ignored when a custom {@link FsStoragePluginOptions.fs} adapter is provided.
   */
  rootDir: string;

  /**
   * Secret used to sign short-lived upload/download tokens (HMAC-SHA256).
   * Falls back to the `CMS_CSRF_SECRET` environment variable when omitted.
   * Must be at least 16 characters.
   */
  signingSecret?: string;

  /**
   * Public base URL for serving files via a static file server (nginx/caddy)
   * or CDN that mounts `rootDir` directly.
   *
   * When set, download URLs become `${publicBaseUrl}/${key}` and the plugin's
   * own serving route is bypassed.
   *
   * ⚠️ A raw static mount serves bytes **without** the CMS row/column policy
   * checks that the `/files/` route enforces. Only set this for buckets that
   * are safe to expose publicly.
   *
   * @example 'https://cdn.example.com/files'
   */
  publicBaseUrl?: string;

  /**
   * Signed token / serve-redirect expiry in seconds.
   *
   * @default 900 (15 minutes)
   */
  expirySeconds?: number;

  /**
   * Maximum request body size (bytes) accepted by the upload route.
   * Uploads are base64-encoded in transit (~+33%), so this is set generously
   * above the largest raw file you expect.
   *
   * @default 14_680_064 (14MB — fits a 10MB file once base64-inflated)
   */
  maxUploadBytes?: number;

  /**
   * Custom filesystem backend. Defaults to a disk-backed adapter rooted at
   * {@link FsStoragePluginOptions.rootDir}. Inject an in-memory adapter for
   * tests or an alternative backend for custom storage.
   */
  fs?: FileSystemAdapter;
}

/**
 * Internal type for resolved plugin options.
 */
export interface ResolvedFsOptions {
  storageId: string;
  basePath: string;
  rootDir: string;
  signingSecret: string;
  publicBaseUrl?: string;
  expirySeconds: number;
  maxUploadBytes: number;
  fs: FileSystemAdapter;
}
