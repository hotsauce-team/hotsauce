// Tests for view components

import { assertEquals, assertStringIncludes } from '@std/assert';
import { fieldsToListColumns, listTable, listView } from '../views/list.ts';
import { detailField, detailView } from '../views/detail.ts';
import { createView, editView } from '../views/edit.ts';
import type { CMSField, IntrospectedColumn } from 'jsr:@hotsauce/core@0.1.0';

// Helper to create mock CMSField
function createMockField(overrides: Partial<CMSField> = {}): CMSField {
  const column: IntrospectedColumn = {
    name: 'test_field',
    propertyName: 'testField',
    dataType: 'string',
    columnType: 'PgVarchar',
    notNull: true,
    hasDefault: false,
    isPrimaryKey: false,
    isUnique: false,
    ...overrides.column,
  };

  return {
    column,
    fieldType: 'text',
    label: 'Test Field',
    ...overrides,
  };
}

// listTable tests
Deno.test('listTable: renders table with records', () => {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
  ];
  const records = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];

  const result = listTable(columns, records, { baseUrl: '/admin/users' });

  assertStringIncludes(result, '<table');
  assertStringIncludes(result, '<th');
  assertStringIncludes(result, 'ID');
  assertStringIncludes(result, 'Name');
  assertStringIncludes(result, 'Alice');
  assertStringIncludes(result, 'Bob');
});

Deno.test('listTable: shows empty message when no records', () => {
  const columns = [{ key: 'id', label: 'ID' }];
  const result = listTable(columns, [], { baseUrl: '/admin/users' });

  assertStringIncludes(result, 'No records found');
  assertStringIncludes(result, 'Create New');
});

Deno.test('listTable: renders edit action', () => {
  const columns = [{ key: 'id', label: 'ID' }];
  const records = [{ id: 1 }];

  const result = listTable(columns, records, {
    baseUrl: '/admin/users',
    showEdit: true,
  });

  assertStringIncludes(result, '/admin/users/1/edit');
  assertStringIncludes(result, 'Edit');
});

Deno.test('listTable: renders delete action', () => {
  const columns = [{ key: 'id', label: 'ID' }];
  const records = [{ id: 1 }];

  const result = listTable(columns, records, {
    baseUrl: '/admin/users',
    showDelete: true,
  });

  assertStringIncludes(result, '/admin/users/1/delete');
  assertStringIncludes(result, 'Delete');
  assertStringIncludes(result, 'confirm');
});

Deno.test('listTable: escapes record values', () => {
  const columns = [{ key: 'name', label: 'Name' }];
  const records = [{ id: 1, name: '<script>alert("xss")</script>' }];

  const result = listTable(columns, records, { baseUrl: '/admin/users' });

  assertStringIncludes(result, '&lt;script&gt;');
});

Deno.test('listTable: uses custom format function', () => {
  const columns = [{
    key: 'amount',
    label: 'Amount',
    format: (v: unknown) => `$${v}`,
  }];
  const records = [{ id: 1, amount: 100 }];

  const result = listTable(columns, records, { baseUrl: '/admin/orders' });

  assertStringIncludes(result, '$100');
});

// listView tests
Deno.test('listView: renders header with title and create button', () => {
  const columns = [{ key: 'id', label: 'ID' }];
  const records = [{ id: 1 }];

  const result = listView('Users', columns, records, {
    baseUrl: '/admin/users',
  });

  assertStringIncludes(result, '<h1>Users</h1>');
  assertStringIncludes(result, '/admin/users/new');
  assertStringIncludes(result, 'Create New');
});

// fieldsToListColumns tests
Deno.test('fieldsToListColumns: converts fields to columns', () => {
  const fields = [
    createMockField({
      column: { propertyName: 'id' } as IntrospectedColumn,
      label: 'ID',
    }),
    createMockField({
      column: { propertyName: 'name' } as IntrospectedColumn,
      label: 'Name',
    }),
  ];

  const columns = fieldsToListColumns(fields);

  assertEquals(columns.length, 2);
  assertEquals(columns[0]?.key, 'id');
  assertEquals(columns[0]?.label, 'ID');
});

Deno.test('fieldsToListColumns: excludes hidden fields', () => {
  const fields = [
    createMockField({
      column: { propertyName: 'id' } as IntrospectedColumn,
      label: 'ID',
      hidden: true,
    }),
    createMockField({
      column: { propertyName: 'name' } as IntrospectedColumn,
      label: 'Name',
    }),
  ];

  const columns = fieldsToListColumns(fields);

  assertEquals(columns.length, 1);
  assertEquals(columns[0]?.key, 'name');
});

Deno.test('fieldsToListColumns: respects exclude list', () => {
  const fields = [
    createMockField({
      column: { propertyName: 'id' } as IntrospectedColumn,
      label: 'ID',
    }),
    createMockField({
      column: { propertyName: 'password' } as IntrospectedColumn,
      label: 'Password',
    }),
  ];

  const columns = fieldsToListColumns(fields, ['password']);

  assertEquals(columns.length, 1);
  assertEquals(columns[0]?.key, 'id');
});

// detailField tests
Deno.test('detailField: renders field label and value', () => {
  const field = createMockField({ label: 'Username' });
  const result = detailField(field, 'john_doe');

  assertStringIncludes(result, 'Username');
  assertStringIncludes(result, 'john_doe');
});

Deno.test('detailField: returns empty for hidden fields', () => {
  const field = createMockField({ hidden: true });
  const result = detailField(field, 'secret');

  assertEquals(result, '');
});

Deno.test('detailField: formats null as dash', () => {
  const field = createMockField();
  const result = detailField(field, null);

  assertStringIncludes(result, 'cms-null');
  assertStringIncludes(result, '—');
});

Deno.test('detailField: formats boolean values', () => {
  const field = createMockField({ fieldType: 'boolean' });

  assertStringIncludes(detailField(field, true), 'Yes');
  assertStringIncludes(detailField(field, false), 'No');
});

Deno.test('detailField: formats JSON values', () => {
  const field = createMockField({ fieldType: 'json' });
  const result = detailField(field, { key: 'value' });

  assertStringIncludes(result, '<pre');
  // JSON gets escaped - quotes become &quot;
  assertStringIncludes(result, '&quot;key&quot;');
});

// detailView tests
Deno.test('detailView: renders view with title and fields', () => {
  const fields = [
    createMockField({
      column: { propertyName: 'name' } as IntrospectedColumn,
      label: 'Name',
    }),
  ];
  const record = { name: 'Test' };

  const result = detailView('User Details', fields, record, {
    baseUrl: '/admin/users',
    id: 1,
  });

  assertStringIncludes(result, '<h1>User Details</h1>');
  assertStringIncludes(result, 'Name');
  assertStringIncludes(result, 'Test');
});

Deno.test('detailView: shows edit button when enabled', () => {
  const fields = [createMockField()];
  const result = detailView('Details', fields, {}, {
    baseUrl: '/admin/users',
    id: 1,
    showEdit: true,
  });

  assertStringIncludes(result, '/admin/users/1/edit');
  assertStringIncludes(result, 'Edit');
});

Deno.test('detailView: shows frontend URL link when provided', () => {
  const fields = [createMockField()];
  const result = detailView('Details', fields, {}, {
    baseUrl: '/admin/users',
    id: 1,
    frontendUrl: '/users/john',
  });

  assertStringIncludes(result, 'View on site');
  assertStringIncludes(result, 'href="/users/john"');
  assertStringIncludes(result, 'target="_blank"');
});

Deno.test('detailView: hides frontend URL link when null', () => {
  const fields = [createMockField()];
  const result = detailView('Details', fields, {}, {
    baseUrl: '/admin/users',
    id: 1,
    frontendUrl: null,
  });

  assertEquals(result.includes('View on site'), false);
});

// editView tests
Deno.test('editView: renders form for editing', () => {
  const fields = [
    createMockField({ column: { propertyName: 'name' } as IntrospectedColumn }),
  ];

  const result = editView('Edit User', fields, {
    baseUrl: '/admin/users',
    id: 1,
  }, { name: 'John' });

  assertStringIncludes(result, '<h1>Edit User</h1>');
  assertStringIncludes(result, 'action="/admin/users/1"');
  assertStringIncludes(result, 'value="John"');
  assertStringIncludes(result, 'Update');
});

Deno.test('editView: shows frontend URL link when provided', () => {
  const fields = [
    createMockField({ column: { propertyName: 'name' } as IntrospectedColumn }),
  ];

  const result = editView('Edit User', fields, {
    baseUrl: '/admin/users',
    id: 1,
    frontendUrl: '/users/john',
  }, { name: 'John' });

  assertStringIncludes(result, 'View on site');
  assertStringIncludes(result, 'href="/users/john"');
  assertStringIncludes(result, 'target="_blank"');
});

Deno.test('editView: hides frontend URL link when null', () => {
  const fields = [
    createMockField({ column: { propertyName: 'name' } as IntrospectedColumn }),
  ];

  const result = editView('Edit User', fields, {
    baseUrl: '/admin/users',
    id: 1,
    frontendUrl: null,
  }, { name: 'John' });

  assertEquals(result.includes('View on site'), false);
});

Deno.test('createView: renders form for creating', () => {
  const fields = [createMockField()];

  const result = createView('New User', fields, {
    baseUrl: '/admin/users',
  });

  assertStringIncludes(result, '<h1>New User</h1>');
  assertStringIncludes(result, 'action="/admin/users"');
  assertStringIncludes(result, 'Create');
});

Deno.test('editView: shows validation errors', () => {
  const fields = [
    createMockField({
      column: { propertyName: 'email' } as IntrospectedColumn,
    }),
  ];

  const result = editView(
    'Edit',
    fields,
    {
      baseUrl: '/admin/users',
      id: 1,
    },
    {},
    { email: 'Invalid email address' },
  );

  assertStringIncludes(result, 'Invalid email address');
  assertStringIncludes(result, 'cms-error');
});
