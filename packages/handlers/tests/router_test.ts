// Tests for router utilities

import { assertEquals, assertExists } from 'jsr:@std/assert';
import { parseRoute, resolveAction, cmsUrl, formatTableName, formatColumnName } from '../router.ts';
import type { IntrospectedTable } from '@drizzle-cms/core';

// Mock tables for testing
const mockTables: IntrospectedTable[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', propertyName: 'id', columnType: 'PgSerial', dataType: 'number', notNull: true, hasDefault: true, isPrimaryKey: true, isUnique: false },
      { name: 'email', propertyName: 'email', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: true },
    ],
    primaryKey: ['id'],
    table: {},
  },
  {
    name: 'posts',
    columns: [
      { name: 'id', propertyName: 'id', columnType: 'PgSerial', dataType: 'number', notNull: true, hasDefault: true, isPrimaryKey: true, isUnique: false },
      { name: 'title', propertyName: 'title', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: false },
    ],
    primaryKey: ['id'],
    table: {},
  },
];

// =============================================================================
// parseRoute tests
// =============================================================================

Deno.test('parseRoute: dashboard route', () => {
  const url = new URL('http://localhost/admin');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table, null);
  assertEquals(route.action, 'dashboard');
});

Deno.test('parseRoute: dashboard with trailing slash', () => {
  const url = new URL('http://localhost/admin/');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.action, 'dashboard');
});

Deno.test('parseRoute: list route', () => {
  const url = new URL('http://localhost/admin/users');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table?.name, 'users');
  assertEquals(route.action, 'list');
});

Deno.test('parseRoute: create route', () => {
  const url = new URL('http://localhost/admin/users/new');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table?.name, 'users');
  assertEquals(route.action, 'create');
});

Deno.test('parseRoute: read route', () => {
  const url = new URL('http://localhost/admin/users/123');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table?.name, 'users');
  assertEquals(route.action, 'read');
  assertEquals(route.recordId, '123');
});

Deno.test('parseRoute: update route', () => {
  const url = new URL('http://localhost/admin/users/123/edit');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table?.name, 'users');
  assertEquals(route.action, 'update');
  assertEquals(route.recordId, '123');
});

Deno.test('parseRoute: delete route', () => {
  const url = new URL('http://localhost/admin/users/123/delete');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertExists(route);
  assertEquals(route.table?.name, 'users');
  assertEquals(route.action, 'delete');
  assertEquals(route.recordId, '123');
});

Deno.test('parseRoute: returns null for unknown table', () => {
  const url = new URL('http://localhost/admin/unknown');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertEquals(route, null);
});

Deno.test('parseRoute: returns null for path not starting with basePath', () => {
  const url = new URL('http://localhost/other/users');
  const route = parseRoute(url, '/admin', mockTables);
  
  assertEquals(route, null);
});

// =============================================================================
// resolveAction tests
// =============================================================================

Deno.test('resolveAction: GET dashboard', () => {
  const route = { table: null, action: 'dashboard' as const };
  assertEquals(resolveAction(route, 'GET'), 'dashboard');
});

Deno.test('resolveAction: POST dashboard returns null', () => {
  const route = { table: null, action: 'dashboard' as const };
  assertEquals(resolveAction(route, 'POST'), null);
});

Deno.test('resolveAction: GET list', () => {
  const route = { table: mockTables[0] ?? null, action: 'list' as const };
  assertEquals(resolveAction(route, 'GET'), 'list');
});

Deno.test('resolveAction: GET create (form)', () => {
  const route = { table: mockTables[0] ?? null, action: 'create' as const };
  assertEquals(resolveAction(route, 'GET'), 'create');
});

Deno.test('resolveAction: POST create (submit)', () => {
  const route = { table: mockTables[0] ?? null, action: 'create' as const };
  assertEquals(resolveAction(route, 'POST'), 'create');
});

Deno.test('resolveAction: GET read', () => {
  const route = { table: mockTables[0] ?? null, action: 'read' as const, recordId: '1' };
  assertEquals(resolveAction(route, 'GET'), 'read');
});

Deno.test('resolveAction: POST update', () => {
  const route = { table: mockTables[0] ?? null, action: 'update' as const, recordId: '1' };
  assertEquals(resolveAction(route, 'POST'), 'update');
});

Deno.test('resolveAction: POST delete', () => {
  const route = { table: mockTables[0] ?? null, action: 'delete' as const, recordId: '1' };
  assertEquals(resolveAction(route, 'POST'), 'delete');
});

// =============================================================================
// cmsUrl tests
// =============================================================================

Deno.test('cmsUrl: dashboard', () => {
  assertEquals(cmsUrl('/admin'), '/admin');
});

Deno.test('cmsUrl: list', () => {
  assertEquals(cmsUrl('/admin', 'users'), '/admin/users');
});

Deno.test('cmsUrl: read', () => {
  assertEquals(cmsUrl('/admin', 'users', '123'), '/admin/users/123');
});

Deno.test('cmsUrl: edit', () => {
  assertEquals(cmsUrl('/admin', 'users', '123', 'edit'), '/admin/users/123/edit');
});

Deno.test('cmsUrl: create (new)', () => {
  assertEquals(cmsUrl('/admin', 'users', undefined, 'create'), '/admin/users/new');
});

Deno.test('cmsUrl: delete', () => {
  assertEquals(cmsUrl('/admin', 'users', '123', 'delete'), '/admin/users/123/delete');
});

Deno.test('cmsUrl: strips trailing slashes from basePath', () => {
  assertEquals(cmsUrl('/admin/', 'users'), '/admin/users');
});

// =============================================================================
// formatTableName tests
// =============================================================================

Deno.test('formatTableName: converts snake_case', () => {
  assertEquals(formatTableName('user_profiles'), 'User Profiles');
});

Deno.test('formatTableName: handles single word', () => {
  assertEquals(formatTableName('users'), 'Users');
});

Deno.test('formatTableName: handles multiple underscores', () => {
  assertEquals(formatTableName('user_account_settings'), 'User Account Settings');
});

// =============================================================================
// formatColumnName tests
// =============================================================================

Deno.test('formatColumnName: converts snake_case', () => {
  assertEquals(formatColumnName('created_at'), 'Created At');
});

Deno.test('formatColumnName: handles single word', () => {
  assertEquals(formatColumnName('email'), 'Email');
});
