// CMS admin configuration
// Sets up hotsauce-cms handler for /admin routes
import { createCmsHandler, PasswordProvider, readOnly } from '@hotsauce/cms';
import { createPuckPlugin } from '@hotsauce/plugins/puck';
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';

import type { Database } from '../db.ts';
import { adminUsers, parsers, schema } from '../schema.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';
import { createMarkdownPlugin } from '../lib/markdown-plugin.ts';

/**
 * Create the CMS handler for admin routes
 *
 * Storage strategy (DEMO ONLY - don't do this in production):
 * - Without S3 env vars: files stored as base64 in database (simple, no external deps)
 * - With S3 env vars: files uploaded directly to S3/MinIO via presigned URLs
 *
 * In production, pick ONE storage strategy and configure it explicitly.
 * This conditional pattern is only for demo convenience.
 */
export function createAdminHandler(db: Database) {
  // Build plugins array
  const plugins = [
    createMarkdownPlugin({
      parse: parseMarkdown,
      sanitize: sanitizeHtml,
    }),
    createPuckPlugin({
      basePath: '/admin',
      componentsJs: '/admin/components.js',
      componentsCss: '/static/components.css',
    }),
  ];

  // S3 storage plugin (optional)
  // Without these env vars, files are stored as base64 in the database.
  // With these env vars, files are uploaded directly to S3 via presigned URLs.
  //
  // To enable S3 locally with MinIO:
  //   docker compose -f docker-compose.yml -f docker-compose.s3.yml up
  //
  // WARNING: This env-var-based conditional is for DEMO ONLY.
  // In production, explicitly configure your storage strategy.
  const s3Endpoint = Deno.env.get('S3_ENDPOINT');
  const s3Bucket = Deno.env.get('S3_BUCKET');
  const s3AccessKey = Deno.env.get('S3_ACCESS_KEY');
  const s3SecretKey = Deno.env.get('S3_SECRET_KEY');

  if (s3Endpoint && s3Bucket && s3AccessKey && s3SecretKey) {
    plugins.push(
      createS3StoragePlugin({
        basePath: '/admin',
        endpoint: s3Endpoint,
        // Public endpoint for browser-facing URLs (Docker: internal vs external)
        publicEndpoint: Deno.env.get('S3_PUBLIC_ENDPOINT') ?? s3Endpoint,
        region: Deno.env.get('S3_REGION') ?? 'us-east-1',
        bucket: s3Bucket,
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey,
        urlStyle: 'path', // Works with MinIO and most S3-compatible providers
        expirySeconds: 900, // 15 minutes
      }),
    );
    // deno-lint-ignore no-console
    console.log('S3 storage plugin enabled:', s3Endpoint);
  }

  return createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    auth: {
      provider: new PasswordProvider({ db, usersTable: adminUsers }),
    },
    policies: {
      // Settings are read-only for non-admins
      settings: readOnly(),
    },
    parsers,
    plugins,
    // Configure storage if S3 plugin is enabled
    storage: s3Endpoint ? { defaultObjectStorageId: 's3' } : undefined,
    onError: (error, context) =>
      // deno-lint-ignore no-console
      console.error('CMS Error:', { error, context }),
  });
}
