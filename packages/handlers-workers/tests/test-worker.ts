// Example worker plugin file for testing

import { setupWorkerPlugin } from '../mod.ts';
import { createPlugin } from '@drizzle-cms/handlers';

// Create a simple test plugin that logs to console
const testPlugin = createPlugin('test-worker', {
  afterCreate: async (ctx) => {
    console.log('[Worker] afterCreate hook executed', {
      table: ctx.table.name,
      action: ctx.action,
    });
  },
  beforeCreate: async (ctx) => {
    console.log('[Worker] beforeCreate hook executed', {
      table: ctx.table.name,
      action: ctx.action,
    });
    // Could validate data here and throw to abort
  },
});

// Set up the worker to handle plugin execution
setupWorkerPlugin(testPlugin);
