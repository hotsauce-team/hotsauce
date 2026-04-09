// Unit tests for grid-helpers.ts

import { assertEquals } from '@std/assert';
import { appendReturnParam } from '../grid-helpers.ts';

Deno.test('appendReturnParam: handles absolute URL without query or fragment', () => {
  const result = appendReturnParam(
    'https://s3.example.com/upload',
    '/admin/media?selected=1',
  );
  assertEquals(
    result,
    'https://s3.example.com/upload?return=%2Fadmin%2Fmedia%3Fselected%3D1',
  );
});

Deno.test('appendReturnParam: handles absolute URL with existing query', () => {
  const result = appendReturnParam(
    'https://s3.example.com/upload?bucket=media',
    '/admin/media',
  );
  assertEquals(
    result,
    'https://s3.example.com/upload?bucket=media&return=%2Fadmin%2Fmedia',
  );
});

Deno.test('appendReturnParam: replaces existing return param', () => {
  const result = appendReturnParam(
    'https://s3.example.com/upload?return=old',
    '/admin/media',
  );
  assertEquals(
    result,
    'https://s3.example.com/upload?return=%2Fadmin%2Fmedia',
  );
});

Deno.test('appendReturnParam: preserves fragment and places it after query', () => {
  const result = appendReturnParam(
    'https://s3.example.com/upload#section',
    '/admin/media',
  );
  assertEquals(
    result,
    'https://s3.example.com/upload?return=%2Fadmin%2Fmedia#section',
  );
});

Deno.test('appendReturnParam: handles relative URL with fragment', () => {
  const result = appendReturnParam('/upload#section', '/admin/media');
  assertEquals(result, '/upload?return=%2Fadmin%2Fmedia#section');
});
