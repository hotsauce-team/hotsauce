// CMS admin configuration for marketing site

import { createCmsHandler, PasswordProvider } from '@hotsauce/cms';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from '../schema.ts';
import { users } from '../schema.ts';

type DB = BaseSQLiteDatabase<'async', unknown, typeof schema>;

/**
 * Create the CMS handler for admin routes
 */
export function createAdminHandler(db: DB) {
  const isLocal = Deno.env.get('NODE_ENV') === 'local';

  return createCmsHandler({
    db,
    schema,
    basePath: '/admin',
    // Local dev: open auth for convenience
    // Production: password auth required
    auth: isLocal ? 'dangerously-open' : {
      provider: new PasswordProvider({ db, usersTable: users }),
    },
    // Empty policies = full access to all tables
    policies: {},
    // Emits X-Rate-Limit-Level for edge throttling. The app does not strip
    // it — the consuming proxy must (locally: the caddy service in
    // ../docker-compose.yml, whose hint_penaltybox module strips by
    // default; production: equivalent proxy config required).
    rateLimitHints: 'header',
    onError: (error, context) => {
      // deno-lint-ignore no-console
      console.error('CMS Error:', { error, context });
    },
  });
}
