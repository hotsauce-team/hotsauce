// Tests for the main handler

import { assertEquals } from 'jsr:@std/assert';
import { createCmsHandler } from '../mod.ts';
import type { IntrospectedSchema, IntrospectedTable } from '@drizzle-cms/core';

// Test CSRF secret
const TEST_CSRF_SECRET = 'test-csrf-secret-for-handler-tests-min-32-chars';

// Mock schema for testing
const mockTable: IntrospectedTable = {
  name: 'users',
  columns: [
    { name: 'id', propertyName: 'id', columnType: 'PgSerial', dataType: 'number', notNull: true, hasDefault: true, isPrimaryKey: true, isUnique: false },
    { name: 'email', propertyName: 'email', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: true },
  ],
  primaryKey: ['id'],
  table: {},
};

const mockSchema: IntrospectedSchema = {
  tables: [mockTable],
  relations: [],
  junctions: [],
};

// Mock database
const mockDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }), limit: () => ({ offset: () => Promise.resolve([]) }) }) }),
  insert: () => ({ values: () => ({ returning: () => Promise.resolve([{ id: 1 }]) }) }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  delete: () => ({ where: () => Promise.resolve() }),
};

// =============================================================================
// createCmsHandler tests
// =============================================================================

Deno.test('createCmsHandler: returns a function', () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
  });
  
  assertEquals(typeof handler, 'function');
});

Deno.test('createCmsHandler: 404 for unknown routes', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/other');
  const response = await handler(request);
  
  assertEquals(response.status, 404);
});

Deno.test('createCmsHandler: 403 when not authenticated', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
    isAuthenticated: () => false,
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  
  assertEquals(response.status, 403);
});

Deno.test('createCmsHandler: renders dashboard on GET /admin', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  
  const html = await response.text();
  assertEquals(html.includes('Dashboard'), true);
});

Deno.test('createCmsHandler: 405 for POST on dashboard', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
  });
  
  const request = new Request('http://localhost/admin', { method: 'POST' });
  const response = await handler(request);
  
  assertEquals(response.status, 405);
});

Deno.test('createCmsHandler: custom title appears in dashboard', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
    title: 'My CMS',
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  const html = await response.text();
  
  assertEquals(html.includes('My CMS'), true);
});

Deno.test('createCmsHandler: async authentication check', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
    isAuthenticated: async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return true;
    },
  });
  
  const request = new Request('http://localhost/admin');
  const response = await handler(request);
  
  assertEquals(response.status, 200);
});

Deno.test('createCmsHandler: canAccess authorization check', async () => {
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: mockDb,
    basePath: '/admin',
    canAccess: (_req, table, _action) => {
      return table.name !== 'users'; // Block access to users table
    },
  });
  
  const request = new Request('http://localhost/admin/users');
  const response = await handler(request);
  
  assertEquals(response.status, 403);
});

Deno.test('createCmsHandler: onError callback is called on database error', async () => {
  let capturedError: Error | undefined;
  let capturedContext: unknown;
  
  // Mock db that throws on select
  const throwingDb = {
    select: () => ({ 
      from: () => { 
        throw new Error('Database connection failed'); 
      } 
    }),
  };
  
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: throwingDb,
    basePath: '/admin',
    onError: (error, context) => {
      capturedError = error;
      capturedContext = context;
    },
  });
  
  const request = new Request('http://localhost/admin/users');
  const response = await handler(request);
  
  // Should return 500
  assertEquals(response.status, 500);
  
  // onError should have been called
  assertEquals(capturedError !== undefined, true);
  assertEquals(capturedError!.message, 'Database connection failed');
  
  // Context should include request info
  assertEquals((capturedContext as { action: string }).action, 'list');
});

Deno.test('createCmsHandler: onError handles non-Error throws', async () => {
  let capturedError: Error | undefined;
  
  // Mock db that throws a string (not an Error)
  const throwingDb = {
    select: () => ({ 
      from: () => { 
        throw 'string error'; // Non-Error throw
      } 
    }),
  };
  
  const handler = createCmsHandler({
    csrfSecret: TEST_CSRF_SECRET,
    schema: mockSchema,
    db: throwingDb,
    basePath: '/admin',
    onError: (error) => {
      capturedError = error;
    },
  });
  
  const request = new Request('http://localhost/admin/users');
  const response = await handler(request);
  
  assertEquals(response.status, 500);
  assertEquals(capturedError instanceof Error, true);
  assertEquals(capturedError!.message, 'string error');
});
