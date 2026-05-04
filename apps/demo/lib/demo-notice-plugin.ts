// Demo notice plugin
//
// Adds a "Demo mode" info banner to every CMS page when NODE_ENV !== 'local'.
// Pairs with the read-only middleware in server.ts so that admins know why
// their POSTs are being rejected.

import process from 'node:process';
import type { PluginConfig } from '@hotsauce/cms';

export function createDemoNoticePlugin(): PluginConfig {
  return {
    name: 'demo-notice',
    // No `filter` needed: the resolveFlashes UI hook receives only flash
    // messages and request metadata (action, table, user), not record data.
    hooks: {
      ui: {
        resolveFlashes: (ctx) => {
          if (process.env.NODE_ENV === 'local') return ctx.flashes;
          return [
            {
              type: 'info',
              message:
                'Demo mode: changes are not saved. Clone and run locally for full functionality.',
            },
            ...ctx.flashes,
          ];
        },
      },
    },
  };
}
