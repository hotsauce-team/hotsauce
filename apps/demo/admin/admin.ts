// CMS admin configuration
// Sets up hotsauce-cms handler for /admin routes
import { createCmsHandler, PasswordProvider, readOnly } from '@hotsauce/cms';
import type { FilterContext, WorkerPluginConfig } from '@hotsauce/cms';
import type { TransformHooks } from '@hotsauce/workers';
import { createPuckPlugin } from '@hotsauce/plugins/puck';

import type { Database } from '../db.ts';
import { adminUsers, parsers, schema } from '../schema.ts';

/** Tables that have content/contentHtml columns (markdown) */
const MARKDOWN_TABLES = ['posts']; // pages now use Puck visual editor

/** Hooks that the markdown plugin handles */
const TRANSFORM_HOOKS: (keyof TransformHooks)[] = [
  'beforeSave',
  'afterRead',
] as const;

const HOOK_TYPES = TRANSFORM_HOOKS.map((hook) => `transform:${hook}`);

/**
 * Create the CMS handler for admin routes
 */
export function createAdminHandler(db: Database) {
  // Create Worker for markdown rendering plugin
  // Worker provides isolation (runs in separate thread with limited permissions)
  // Note: In Deno, Workers need explicit read permission to load the module
  const markdownWorker = new Worker(
    import.meta.resolve('./markdown-worker.ts'),
    { type: 'module', deno: { permissions: {} } },
  );

  // Worker plugin config - declarative hooks, filter controls data flow
  const markdownPlugin: WorkerPluginConfig = {
    name: 'markdown-renderer',
    description: 'Renders markdown content to HTML at save time',
    worker: markdownWorker,
    // Declarative: which hooks the Worker handles
    hooks: {
      transform: TRANSFORM_HOOKS,
    },
    // Filter: only send posts/pages beforeSave to the Worker
    filter: (ctx: FilterContext) =>
      HOOK_TYPES.includes(ctx.hookType) &&
      MARKDOWN_TABLES.includes(ctx.table),
  };

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
      markdownPlugin,
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
