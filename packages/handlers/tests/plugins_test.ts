// Tests for plugin system

import { assertEquals } from 'jsr:@std/assert';
import { createPlugin } from '../plugins/mod.ts';
import type { AfterContext, BeforeContext } from '../plugins/types.ts';
import type { IntrospectedTable } from '@drizzle-cms/core';

// Mock table for testing
const mockTable: IntrospectedTable = {
  name: 'users',
  columns: [
    { name: 'id', propertyName: 'id', columnType: 'PgSerial', dataType: 'number', notNull: true, hasDefault: true, isPrimaryKey: true, isUnique: false },
    { name: 'email', propertyName: 'email', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: true },
  ],
  primaryKey: ['id'],
  table: {},
};

const mockDb = {};

Deno.test('createPlugin: creates a plugin with name and hooks', () => {
  const plugin = createPlugin('test-plugin', {
    afterCreate: async (ctx: AfterContext) => {
      // Test hook
    },
  });
  
  assertEquals(plugin.name, 'test-plugin');
  assertEquals(typeof plugin.hooks.afterCreate, 'function');
});

Deno.test('plugin hooks: beforeCreate is called', async () => {
  let called = false;
  const testData = { email: 'test@example.com' };
  
  const plugin = createPlugin('test', {
    beforeCreate: async (ctx: BeforeContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'create');
      assertEquals(ctx.data, testData);
    },
  });
  
  const ctx: BeforeContext = {
    table: mockTable,
    action: 'create',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    data: testData,
  };
  
  await plugin.hooks.beforeCreate?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: afterCreate is called', async () => {
  let called = false;
  const testRecord = { id: 1, email: 'test@example.com' };
  
  const plugin = createPlugin('test', {
    afterCreate: async (ctx: AfterContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'create');
      assertEquals(ctx.record, testRecord);
    },
  });
  
  const ctx: AfterContext = {
    table: mockTable,
    action: 'create',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    record: testRecord,
  };
  
  await plugin.hooks.afterCreate?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: beforeUpdate is called', async () => {
  let called = false;
  const testData = { email: 'updated@example.com' };
  
  const plugin = createPlugin('test', {
    beforeUpdate: async (ctx: BeforeContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'update');
      assertEquals(ctx.data, testData);
    },
  });
  
  const ctx: BeforeContext = {
    table: mockTable,
    action: 'update',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    data: testData,
  };
  
  await plugin.hooks.beforeUpdate?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: afterUpdate is called', async () => {
  let called = false;
  const testRecord = { id: 1, email: 'updated@example.com' };
  
  const plugin = createPlugin('test', {
    afterUpdate: async (ctx: AfterContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'update');
      assertEquals(ctx.record, testRecord);
    },
  });
  
  const ctx: AfterContext = {
    table: mockTable,
    action: 'update',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    record: testRecord,
    recordId: '1',
  };
  
  await plugin.hooks.afterUpdate?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: beforeDelete is called', async () => {
  let called = false;
  const testRecord = { id: 1, email: 'test@example.com' };
  
  const plugin = createPlugin('test', {
    beforeDelete: async (ctx: AfterContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'delete');
      assertEquals(ctx.record, testRecord);
    },
  });
  
  const ctx: AfterContext = {
    table: mockTable,
    action: 'delete',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    record: testRecord,
    recordId: '1',
  };
  
  await plugin.hooks.beforeDelete?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: afterDelete is called', async () => {
  let called = false;
  const testRecord = { id: 1, email: 'test@example.com' };
  
  const plugin = createPlugin('test', {
    afterDelete: async (ctx: AfterContext) => {
      called = true;
      assertEquals(ctx.table.name, 'users');
      assertEquals(ctx.action, 'delete');
      assertEquals(ctx.record, testRecord);
    },
  });
  
  const ctx: AfterContext = {
    table: mockTable,
    action: 'delete',
    authUser: undefined,
    request: new Request('http://localhost/test'),
    db: mockDb,
    record: testRecord,
    recordId: '1',
  };
  
  await plugin.hooks.afterDelete?.(ctx);
  assertEquals(called, true);
});

Deno.test('plugin hooks: can access authUser context', async () => {
  let capturedUserId: string | undefined;
  
  const plugin = createPlugin('test', {
    afterCreate: async (ctx: AfterContext) => {
      capturedUserId = ctx.authUser?.id;
    },
  });
  
  const ctx: AfterContext = {
    table: mockTable,
    action: 'create',
    authUser: { id: 'user123', role: 'admin' },
    request: new Request('http://localhost/test'),
    db: mockDb,
    record: { id: 1, email: 'test@example.com' },
  };
  
  await plugin.hooks.afterCreate?.(ctx);
  assertEquals(capturedUserId, 'user123');
});
