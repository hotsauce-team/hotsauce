// Tests for form field wrapper component

import { assertStringIncludes } from '@std/assert';
import { formField } from '../forms/field.ts';
import type { CMSField, IntrospectedColumn } from '@hotsauce/core';

// Helper to create mock CMSField
function createMockField(overrides: Partial<CMSField> = {}): CMSField {
  const column: IntrospectedColumn = {
    name: 'test_field',
    propertyName: 'testField',
    dataType: 'string',
    columnType: 'PgVarchar',
    notNull: false,
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

// valueSummary-only override tests

Deno.test('formField: valueSummary-only override renders summary for read-only field', () => {
  const field = createMockField({ readOnly: true });
  const result = formField(field, {
    value: '{"content":[1,2,3]}',
    override: { valueSummary: '3 blocks' },
  });

  assertStringIncludes(result, 'cms-value-summary');
  assertStringIncludes(result, '3 blocks');
  assertStringIncludes(result, 'cms-field-readonly');
});

Deno.test('formField: valueSummary-only override hides raw JSON input', () => {
  const field = createMockField({
    readOnly: true,
    fieldType: 'json',
  });
  const result = formField(field, {
    value: '{"content":[{"type":"heading"}]}',
    override: { valueSummary: '1 block' },
  });

  // Should show summary, not textarea with raw JSON
  assertStringIncludes(result, '1 block');
  // Should not contain the raw JSON value
  if (result.includes('{"content"')) {
    throw new Error(
      'Raw JSON should not be rendered when valueSummary is provided',
    );
  }
});

Deno.test('formField: valueSummary-only override ignored for writable fields', () => {
  const field = createMockField({ readOnly: false });
  const result = formField(field, {
    value: 'test value',
    override: { valueSummary: '3 blocks' },
  });

  // Should render normal input, not the summary
  assertStringIncludes(result, 'type="text"');
  assertStringIncludes(result, 'name="testField"');
  // valueSummary class should not be present
  if (result.includes('cms-value-summary')) {
    throw new Error('valueSummary should not render for writable fields');
  }
});

Deno.test('formField: valueSummary with link renders both for read-only field', () => {
  const field = createMockField({ readOnly: true });
  const result = formField(field, {
    value: '{}',
    override: {
      valueSummary: '5 blocks',
      link: { href: '/edit', label: 'Edit Content', target: '_blank' },
    },
  });

  assertStringIncludes(result, 'cms-value-summary');
  assertStringIncludes(result, '5 blocks');
  assertStringIncludes(result, 'href="/edit"');
  assertStringIncludes(result, 'Edit Content');
  assertStringIncludes(result, '↗'); // external link indicator
});

Deno.test('formField: valueSummary with link renders both for writable field', () => {
  const field = createMockField({ readOnly: false });
  const result = formField(field, {
    value: '{"content":[1,2,3]}',
    override: {
      valueSummary: '3 blocks',
      link: { href: '/puck/edit', label: 'Edit with Puck', target: '_blank' },
    },
  });

  // Should show summary (not raw JSON)
  assertStringIncludes(result, 'cms-value-summary');
  assertStringIncludes(result, '3 blocks');
  // Should show the link
  assertStringIncludes(result, 'href="/puck/edit"');
  assertStringIncludes(result, 'Edit with Puck');
  // Raw JSON should not appear
  if (result.includes('{"content"')) {
    throw new Error(
      'Raw JSON should not be rendered when valueSummary is provided',
    );
  }
});

Deno.test('formField: link-only override renders link without summary', () => {
  const field = createMockField({ readOnly: true });
  const result = formField(field, {
    value: 'some value',
    override: {
      link: { href: '/edit', label: 'Edit' },
    },
  });

  assertStringIncludes(result, 'href="/edit"');
  assertStringIncludes(result, 'Edit');
  // Should render disabled input since no valueSummary
  assertStringIncludes(result, 'disabled');
});
