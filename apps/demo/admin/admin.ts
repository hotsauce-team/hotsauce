// CMS admin configuration
// Sets up hotsauce-cms handler for /admin routes
import { createCmsHandler, PasswordProvider, readOnly } from '@hotsauce/cms';
import { createPuckPlugin } from '@hotsauce/plugins/puck';

import type { Database } from '../db.ts';
import { adminUsers, parsers, schema } from '../schema.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';
import { createMarkdownPlugin } from '../lib/markdown-plugin.ts';

/**
 * Create the CMS handler for admin routes
 */
export function createAdminHandler(db: Database) {
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
    ],
    onError: (error, context) =>
      // deno-lint-ignore no-console
      console.error('CMS Error:', { error, context }),
  });
}
