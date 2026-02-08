// CMS admin configuration
import { createCmsHandler } from '@hotsauce/cms';
import { createPuckPlugin } from '@hotsauce/plugins/puck';

import type { Database } from '../db.ts';
import { parsers, schema } from '../schema.ts';

/**
 * Create the CMS handler for admin routes
 */
export function createAdminHandler(db: Database) {
  return createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    auth: 'dangerously-open',
    parsers,
    plugins: [createPuckPlugin('/admin')],
    onError: (error, context) =>
      // deno-lint-ignore no-console
      console.error('CMS Error:', { error, context }),
  });
}
