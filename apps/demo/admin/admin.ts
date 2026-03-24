import process from 'node:process';

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
import { getDemoS3Config } from '../lib/s3-config.ts';

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
  const s3 = getDemoS3Config();

  return createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    // In local development, use open auth for convenience (no login required).
    // In production, use password auth with credentials from the database.
    auth: process.env.NODE_ENV === 'local' ? 'dangerously-open' : {
      provider: new PasswordProvider({ db, usersTable: adminUsers }),
    },
    policies: {
      // Settings are read-only for non-admins
      settings: readOnly(),
    },
    parsers,
    plugins: [
      createMarkdownPlugin({
        parse: parseMarkdown,
        sanitize: sanitizeHtml,
      }),
      createPuckPlugin({
        basePath: '/admin',
        componentsJs: '/admin/components.js',
        componentsCss: '/static/components.css',
      }),
      ...(s3 ? [createS3StoragePlugin({ ...s3, basePath: '/admin' })] : []),
    ],
    // Configure storage if S3 plugin is enabled
    // Avatar files always stay in the database (small, 20KB limit)
    // Other file columns go to S3
    storage: s3
      ? (ctx) => ctx.column === 'avatar' ? undefined : 's3'
      : undefined,
    // Allow image previews from S3/MinIO endpoint on admin screens
    csp: s3 ? { imgSrc: [s3.publicEndpoint] } : undefined,
    onError: (error, context) =>
      // deno-lint-ignore no-console
      console.error('CMS Error:', { error, context }),
  });
}
