// Tests for FileReference type guard

import { assertEquals } from '@std/assert';
import { isValidFileReference } from '../extend/types.ts';

// =============================================================================
// isValidFileReference tests
// =============================================================================

Deno.test('isValidFileReference: returns true for valid minimal reference', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1234,
  };
  assertEquals(isValidFileReference(ref), true);
});

Deno.test('isValidFileReference: returns true for reference with data', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1234,
    data: 'base64string',
  };
  assertEquals(isValidFileReference(ref), true);
});

Deno.test('isValidFileReference: returns true for reference with url', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1234,
    url: 'https://example.com/test.png',
  };
  assertEquals(isValidFileReference(ref), true);
});

Deno.test('isValidFileReference: returns true for reference with key', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1234,
    key: 'uploads/abc123.png',
  };
  assertEquals(isValidFileReference(ref), true);
});

Deno.test('isValidFileReference: returns true for complete reference', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: 1234,
    data: 'base64',
    key: 'uploads/abc123.png',
    url: 'https://cdn.example.com/abc123.png',
  };
  assertEquals(isValidFileReference(ref), true);
});

Deno.test('isValidFileReference: returns false for null', () => {
  assertEquals(isValidFileReference(null), false);
});

Deno.test('isValidFileReference: returns false for undefined', () => {
  assertEquals(isValidFileReference(undefined), false);
});

Deno.test('isValidFileReference: returns false for string', () => {
  assertEquals(isValidFileReference('test.png'), false);
});

Deno.test('isValidFileReference: returns false for number', () => {
  assertEquals(isValidFileReference(123), false);
});

Deno.test('isValidFileReference: returns false for array', () => {
  assertEquals(isValidFileReference([]), false);
});

Deno.test('isValidFileReference: returns false for empty object', () => {
  assertEquals(isValidFileReference({}), false);
});

Deno.test('isValidFileReference: returns false when missing filename', () => {
  const ref = {
    contentType: 'image/png',
    size: 1234,
  };
  assertEquals(isValidFileReference(ref), false);
});

Deno.test('isValidFileReference: returns false when missing contentType', () => {
  const ref = {
    filename: 'test.png',
    size: 1234,
  };
  assertEquals(isValidFileReference(ref), false);
});

Deno.test('isValidFileReference: returns false when missing size', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
  };
  assertEquals(isValidFileReference(ref), false);
});

Deno.test('isValidFileReference: returns false when filename is wrong type', () => {
  const ref = {
    filename: 123,
    contentType: 'image/png',
    size: 1234,
  };
  assertEquals(isValidFileReference(ref), false);
});

Deno.test('isValidFileReference: returns false when size is string', () => {
  const ref = {
    filename: 'test.png',
    contentType: 'image/png',
    size: '1234',
  };
  assertEquals(isValidFileReference(ref), false);
});
