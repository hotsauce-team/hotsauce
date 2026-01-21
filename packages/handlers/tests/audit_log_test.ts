// Tests for audit log plugin

import { assertEquals, assertExists } from '@std/assert';
import {
  createAuditLogPlugin,
  getAuditLog,
  clearAuditLog,
} from '../plugins/examples/audit-log.ts';
import type { ActionContext } from '../plugins/types.ts';

Deno.test('audit-log plugin', async (t) => {
  // Clear log before each test group
  clearAuditLog();

  await t.step('createAuditLogPlugin: returns plugin with correct structure', () => {
    const plugin = createAuditLogPlugin();
    
    assertEquals(plugin.name, 'audit-log');
    assertExists(plugin.hooks?.on);
    assertExists(plugin.hooks?.on?.create);
    assertExists(plugin.hooks?.on?.update);
    assertExists(plugin.hooks?.on?.delete);
  });

  await t.step('createAuditLogPlugin: respects logReads config', () => {
    const pluginNoReads = createAuditLogPlugin({ logReads: false });
    const pluginWithReads = createAuditLogPlugin({ logReads: true });
    
    assertEquals(pluginNoReads.hooks?.on?.read, undefined);
    assertExists(pluginWithReads.hooks?.on?.read);
  });

  await t.step('createAuditLogPlugin: respects logLists config', () => {
    const pluginNoLists = createAuditLogPlugin({ logLists: false });
    const pluginWithLists = createAuditLogPlugin({ logLists: true });
    
    assertEquals(pluginNoLists.hooks?.on?.list, undefined);
    assertExists(pluginWithLists.hooks?.on?.list);
  });

  await t.step('action handler: logs create action', async () => {
    clearAuditLog();
    const plugin = createAuditLogPlugin();
    const handler = (plugin.hooks?.on?.create as { handler: (ctx: ActionContext) => Promise<void> }).handler;
    
    const ctx: ActionContext = {
      table: 'posts',
      action: 'create',
      recordId: '123',
      user: { sub: 'user-1', role: 'admin' },
      newData: { title: 'Test Post' },
      timestamp: '2024-01-15T10:00:00Z',
    };
    
    await handler(ctx);
    
    const log = getAuditLog();
    assertEquals(log.length, 1);
    assertEquals(log[0]!.action, 'create');
    assertEquals(log[0]!.table, 'posts');
    assertEquals(log[0]!.recordId, '123');
    assertEquals(log[0]!.user?.sub, 'user-1');
    assertEquals((log[0]!.newData as { title: string }).title, 'Test Post');
  });

  await t.step('action handler: logs update action with old and new data', async () => {
    clearAuditLog();
    const plugin = createAuditLogPlugin();
    const handler = (plugin.hooks?.on?.update as { handler: (ctx: ActionContext) => Promise<void> }).handler;
    
    const ctx: ActionContext = {
      table: 'posts',
      action: 'update',
      recordId: '123',
      user: { sub: 'user-1' },
      oldData: { title: 'Old Title' },
      newData: { title: 'New Title' },
      timestamp: '2024-01-15T10:00:00Z',
    };
    
    await handler(ctx);
    
    const log = getAuditLog();
    assertEquals(log.length, 1);
    assertEquals(log[0]!.action, 'update');
    assertEquals((log[0]!.oldData as { title: string }).title, 'Old Title');
    assertEquals((log[0]!.newData as { title: string }).title, 'New Title');
  });

  await t.step('action handler: logs delete action with old data', async () => {
    clearAuditLog();
    const plugin = createAuditLogPlugin();
    const handler = (plugin.hooks?.on?.delete as { handler: (ctx: ActionContext) => Promise<void> }).handler;
    
    const ctx: ActionContext = {
      table: 'posts',
      action: 'delete',
      recordId: '123',
      user: { sub: 'user-1' },
      oldData: { id: '123', title: 'Deleted Post' },
      timestamp: '2024-01-15T10:00:00Z',
    };
    
    await handler(ctx);
    
    const log = getAuditLog();
    assertEquals(log.length, 1);
    assertEquals(log[0]!.action, 'delete');
    assertEquals(log[0]!.oldData, { id: '123', title: 'Deleted Post' });
  });

  await t.step('excludeTables: skips excluded tables', async () => {
    clearAuditLog();
    const plugin = createAuditLogPlugin({ excludeTables: ['_sessions', '_logs'] });
    const handler = (plugin.hooks?.on?.create as { handler: (ctx: ActionContext) => Promise<void> }).handler;
    
    await handler({
      table: '_sessions',
      action: 'create',
      recordId: '1',
      timestamp: '2024-01-15T10:00:00Z',
    });
    
    await handler({
      table: 'posts',
      action: 'create',
      recordId: '2',
      timestamp: '2024-01-15T10:00:00Z',
    });
    
    const log = getAuditLog();
    assertEquals(log.length, 1);
    assertEquals(log[0]!.table, 'posts');
  });

  await t.step('includeTables: only audits included tables', async () => {
    clearAuditLog();
    const plugin = createAuditLogPlugin({ includeTables: ['posts', 'users'] });
    const handler = (plugin.hooks?.on?.create as { handler: (ctx: ActionContext) => Promise<void> }).handler;
    
    await handler({
      table: 'posts',
      action: 'create',
      recordId: '1',
      timestamp: '2024-01-15T10:00:00Z',
    });
    
    await handler({
      table: 'comments',
      action: 'create',
      recordId: '2',
      timestamp: '2024-01-15T10:00:00Z',
    });
    
    await handler({
      table: 'users',
      action: 'create',
      recordId: '3',
      timestamp: '2024-01-15T10:00:00Z',
    });
    
    const log = getAuditLog();
    assertEquals(log.length, 2);
    assertEquals(log[0]!.table, 'posts');
    assertEquals(log[1]!.table, 'users');
  });

  await t.step('capabilities: declares network for webhook URL', () => {
    const plugin = createAuditLogPlugin({
      webhookUrl: 'https://audit.example.com/events',
    });
    
    assertEquals(plugin.capabilities?.network, ['audit.example.com']);
  });

  await t.step('capabilities: includes correct actions', () => {
    const pluginBasic = createAuditLogPlugin();
    const pluginFull = createAuditLogPlugin({ logReads: true, logLists: true });
    
    // Basic: create, update, delete only
    assertEquals(pluginBasic.capabilities?.actions?.includes('create'), true);
    assertEquals(pluginBasic.capabilities?.actions?.includes('update'), true);
    assertEquals(pluginBasic.capabilities?.actions?.includes('delete'), true);
    assertEquals(pluginBasic.capabilities?.actions?.includes('read'), false);
    assertEquals(pluginBasic.capabilities?.actions?.includes('list'), false);
    
    // Full: all actions
    assertEquals(pluginFull.capabilities?.actions?.includes('read'), true);
    assertEquals(pluginFull.capabilities?.actions?.includes('list'), true);
  });

  await t.step('fireAndForget: all hooks use fire-and-forget', () => {
    const plugin = createAuditLogPlugin({ logReads: true, logLists: true });
    const hooks = plugin.hooks?.on;
    
    assertEquals((hooks?.create as { fireAndForget?: boolean })?.fireAndForget, true);
    assertEquals((hooks?.read as { fireAndForget?: boolean })?.fireAndForget, true);
    assertEquals((hooks?.update as { fireAndForget?: boolean })?.fireAndForget, true);
    assertEquals((hooks?.delete as { fireAndForget?: boolean })?.fireAndForget, true);
    assertEquals((hooks?.list as { fireAndForget?: boolean })?.fireAndForget, true);
  });
});
