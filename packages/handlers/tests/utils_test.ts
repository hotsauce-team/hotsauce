// Tests for utility functions

import { assertEquals, assertExists } from 'jsr:@std/assert';
import {
  htmlResponse,
  redirect,
  jsonResponse,
  notFound,
  forbidden,
  methodNotAllowed,
  parseFormData,
  coerceFormValues,
  coerceValue,
  getPagination,
  getSort,
} from '../utils.ts';
import type { IntrospectedColumn } from '@drizzle-cms/core';

// =============================================================================
// Response helper tests
// =============================================================================

Deno.test('htmlResponse: creates HTML response', () => {
  const response = htmlResponse('<p>Hello</p>');
  
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
});

Deno.test('htmlResponse: custom status code', () => {
  const response = htmlResponse('<p>Error</p>', 500);
  
  assertEquals(response.status, 500);
});

Deno.test('redirect: creates redirect response', () => {
  const response = redirect('/admin/users');
  
  assertEquals(response.status, 303);
  assertEquals(response.headers.get('Location'), '/admin/users');
});

Deno.test('redirect: custom status code', () => {
  const response = redirect('/admin', 302);
  
  assertEquals(response.status, 302);
});

Deno.test('jsonResponse: creates JSON response', () => {
  const response = jsonResponse({ success: true });
  
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('notFound: creates 404 response', () => {
  const response = notFound('Page not found');
  
  assertEquals(response.status, 404);
});

Deno.test('forbidden: creates 403 response', () => {
  const response = forbidden('Access denied');
  
  assertEquals(response.status, 403);
});

Deno.test('methodNotAllowed: creates 405 response', () => {
  const response = methodNotAllowed(['GET', 'POST']);
  
  assertEquals(response.status, 405);
  assertEquals(response.headers.get('Allow'), 'GET, POST');
});

// =============================================================================
// coerceValue tests
// =============================================================================

Deno.test('coerceValue: string remains string', () => {
  assertEquals(coerceValue('hello', 'string'), 'hello');
});

Deno.test('coerceValue: number converts to number', () => {
  assertEquals(coerceValue('42', 'number'), 42);
});

Deno.test('coerceValue: invalid number returns null', () => {
  assertEquals(coerceValue('abc', 'number'), null);
});

Deno.test('coerceValue: bigint converts to integer', () => {
  assertEquals(coerceValue('123', 'bigint'), 123);
});

Deno.test('coerceValue: boolean true', () => {
  assertEquals(coerceValue('true', 'boolean'), true);
  assertEquals(coerceValue('1', 'boolean'), true);
  assertEquals(coerceValue('on', 'boolean'), true);
});

Deno.test('coerceValue: boolean false', () => {
  assertEquals(coerceValue('false', 'boolean'), false);
  assertEquals(coerceValue('0', 'boolean'), false);
});

Deno.test('coerceValue: json parses object', () => {
  const result = coerceValue('{"key": "value"}', 'json');
  assertEquals(result, { key: 'value' });
});

Deno.test('coerceValue: invalid json returns null', () => {
  assertEquals(coerceValue('not json', 'json'), null);
});

Deno.test('coerceValue: date returns string', () => {
  assertEquals(coerceValue('2024-01-15', 'date'), '2024-01-15');
});

Deno.test('coerceValue: empty string for non-string returns null', () => {
  assertEquals(coerceValue('', 'number'), null);
  assertEquals(coerceValue('', 'boolean'), null);
  assertEquals(coerceValue('', 'json'), null);
});

// =============================================================================
// coerceFormValues tests
// =============================================================================

Deno.test('coerceFormValues: converts form data based on column types', () => {
  const formData = {
    name: 'John',
    age: '30',
    active: 'true',
  };
  
  const columns: IntrospectedColumn[] = [
    { name: 'name', propertyName: 'name', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: false },
    { name: 'age', propertyName: 'age', columnType: 'PgInteger', dataType: 'number', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: false },
    { name: 'active', propertyName: 'active', columnType: 'PgBoolean', dataType: 'boolean', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: false },
  ];
  
  const result = coerceFormValues(formData, columns);
  
  assertEquals(result.name, 'John');
  assertEquals(result.age, 30);
  assertEquals(result.active, true);
});

Deno.test('coerceFormValues: handles nullable fields with empty values', () => {
  const formData = {
    bio: '',
  };
  
  const columns: IntrospectedColumn[] = [
    { name: 'bio', propertyName: 'bio', columnType: 'PgText', dataType: 'string', notNull: false, hasDefault: false, isPrimaryKey: false, isUnique: false },
  ];
  
  const result = coerceFormValues(formData, columns);
  
  assertEquals(result.bio, null);
});

Deno.test('coerceFormValues: handles array values', () => {
  const formData = {
    tags: ['one', 'two'],
  };
  
  const columns: IntrospectedColumn[] = [
    { name: 'tags', propertyName: 'tags', columnType: 'PgVarchar', dataType: 'string', notNull: true, hasDefault: false, isPrimaryKey: false, isUnique: false },
  ];
  
  const result = coerceFormValues(formData, columns);
  
  assertEquals(result.tags, 'one'); // Uses first value
});

// =============================================================================
// getPagination tests
// =============================================================================

Deno.test('getPagination: default values', () => {
  const url = new URL('http://localhost/admin/users');
  const { page, limit, offset } = getPagination(url);
  
  assertEquals(page, 1);
  assertEquals(limit, 25);
  assertEquals(offset, 0);
});

Deno.test('getPagination: custom page', () => {
  const url = new URL('http://localhost/admin/users?page=3');
  const { page, offset } = getPagination(url);
  
  assertEquals(page, 3);
  assertEquals(offset, 50); // (3-1) * 25
});

Deno.test('getPagination: custom limit', () => {
  const url = new URL('http://localhost/admin/users?limit=10');
  const { limit, offset } = getPagination(url);
  
  assertEquals(limit, 10);
  assertEquals(offset, 0);
});

Deno.test('getPagination: enforces min page 1', () => {
  const url = new URL('http://localhost/admin/users?page=0');
  const { page } = getPagination(url);
  
  assertEquals(page, 1);
});

Deno.test('getPagination: enforces max limit 100', () => {
  const url = new URL('http://localhost/admin/users?limit=500');
  const { limit } = getPagination(url);
  
  assertEquals(limit, 100);
});

// =============================================================================
// getSort tests
// =============================================================================

Deno.test('getSort: returns null without sort param', () => {
  const url = new URL('http://localhost/admin/users');
  const columns = ['id', 'name', 'email'];
  
  assertEquals(getSort(url, columns), null);
});

Deno.test('getSort: ascending sort', () => {
  const url = new URL('http://localhost/admin/users?sort=name');
  const columns = ['id', 'name', 'email'];
  const sort = getSort(url, columns);
  
  assertExists(sort);
  assertEquals(sort.column, 'name');
  assertEquals(sort.direction, 'asc');
});

Deno.test('getSort: descending sort', () => {
  const url = new URL('http://localhost/admin/users?sort=-created_at');
  const columns = ['id', 'created_at'];
  const sort = getSort(url, columns);
  
  assertExists(sort);
  assertEquals(sort.column, 'created_at');
  assertEquals(sort.direction, 'desc');
});

Deno.test('getSort: returns null for invalid column', () => {
  const url = new URL('http://localhost/admin/users?sort=unknown');
  const columns = ['id', 'name'];
  
  assertEquals(getSort(url, columns), null);
});

// =============================================================================
// parseFormData tests
// =============================================================================

Deno.test('parseFormData: parses form data', async () => {
  const formData = new FormData();
  formData.append('name', 'John');
  formData.append('email', 'john@example.com');
  
  const request = new Request('http://localhost', {
    method: 'POST',
    body: formData,
  });
  
  const result = await parseFormData(request);
  
  assertEquals(result.name, 'John');
  assertEquals(result.email, 'john@example.com');
});

Deno.test('parseFormData: handles multiple values with same name', async () => {
  const formData = new FormData();
  formData.append('tag', 'one');
  formData.append('tag', 'two');
  
  const request = new Request('http://localhost', {
    method: 'POST',
    body: formData,
  });
  
  const result = await parseFormData(request);
  
  assertEquals(result.tag, ['one', 'two']);
});
