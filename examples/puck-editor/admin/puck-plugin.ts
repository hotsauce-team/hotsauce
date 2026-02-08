// Puck Editor Plugin
// Adds "Edit with Puck" links to columns marked with .$cms({ plugins: { puck: true } })

import type { InProcessPluginConfig } from '@hotsauce/cms';

/**
 * Create a Puck editor plugin that adds "Edit with Puck" links
 * to columns marked with `.$cms({ plugins: { puck: true } })`.
 *
 * The plugin uses `ctx.field.plugin` which is automatically set
 * by the CMS when a column has plugin config for this plugin name.
 */
export function createPuckPlugin(basePath: string): InProcessPluginConfig {
  return {
    name: 'puck',
    description: 'Adds Puck editor links to configured columns',
    hooks: {
      ui: {
        renderField: (ctx) => {
          // ctx.field.plugin is set if column has .$cms({ plugins: { puck: ... } })
          if (ctx.field.plugin && ctx.recordId) {
            const href = `${basePath}/puck/${ctx.table}/${ctx.recordId}/${ctx.field.name}`;
            return {
              link: { href, label: 'Edit with Puck', target: '_blank' },
            };
          }
          return null;
        },
      },
    },
    filter: (ctx) => ctx.hookType === 'ui:renderField',
  };
}
