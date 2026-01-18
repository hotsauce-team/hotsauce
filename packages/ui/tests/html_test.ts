// Tests for HTML utilities

import { assertEquals } from 'jsr:@std/assert';
import { html, raw, escapeHtml, attrs, when, join, SafeHtml } from '../html.ts';

// escapeHtml tests
Deno.test('escapeHtml: escapes HTML special characters', () => {
  assertEquals(escapeHtml('<script>'), '&lt;script&gt;');
  assertEquals(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assertEquals(escapeHtml("it's"), "it&#039;s");
  assertEquals(escapeHtml('a & b'), 'a &amp; b');
});

Deno.test('escapeHtml: handles null and undefined', () => {
  assertEquals(escapeHtml(null), '');
  assertEquals(escapeHtml(undefined), '');
});

Deno.test('escapeHtml: converts non-strings to string', () => {
  assertEquals(escapeHtml(123), '123');
  assertEquals(escapeHtml(true), 'true');
});

// html tagged template tests
Deno.test('html: escapes interpolated values', () => {
  const userInput = '<script>alert("xss")</script>';
  const result = html`<p>${userInput}</p>`;
  assertEquals(result, '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>');
});

Deno.test('html: preserves raw() content', () => {
  const trustedHtml = raw('<strong>Bold</strong>');
  const result = html`<p>${trustedHtml}</p>`;
  assertEquals(result, '<p><strong>Bold</strong></p>');
});

Deno.test('html: handles arrays', () => {
  const items = ['<a>', '<b>', '<c>'];
  const result = html`<ul>${items}</ul>`;
  assertEquals(result, '<ul>&lt;a&gt;&lt;b&gt;&lt;c&gt;</ul>');
});

Deno.test('html: handles arrays with raw items', () => {
  const items = [raw('<li>One</li>'), raw('<li>Two</li>')];
  const result = html`<ul>${items}</ul>`;
  assertEquals(result, '<ul><li>One</li><li>Two</li></ul>');
});

Deno.test('html: handles multiple interpolations', () => {
  const name = 'John';
  const age = 30;
  const result = html`<p>Name: ${name}, Age: ${age}</p>`;
  assertEquals(result, '<p>Name: John, Age: 30</p>');
});

// attrs tests
Deno.test('attrs: builds attribute string', () => {
  const result = attrs({ type: 'text', name: 'field', required: true });
  assertEquals(result.value, 'type="text" name="field" required');
});

Deno.test('attrs: omits null/undefined/false values', () => {
  const result = attrs({ a: 'yes', b: null, c: undefined, d: false });
  assertEquals(result.value, 'a="yes"');
});

Deno.test('attrs: escapes values', () => {
  const result = attrs({ value: '<script>' });
  assertEquals(result.value, 'value="&lt;script&gt;"');
});

Deno.test('attrs: handles boolean attributes', () => {
  const result = attrs({ disabled: true, readonly: true, checked: false });
  assertEquals(result.value, 'disabled readonly');
});

// when tests
Deno.test('when: returns content when condition is truthy', () => {
  const result = when(true, '<span>Yes</span>');
  assertEquals(result.value, '<span>Yes</span>');
});

Deno.test('when: returns empty when condition is falsy', () => {
  assertEquals(when(false, 'content').value, '');
  assertEquals(when(null, 'content').value, '');
  assertEquals(when(undefined, 'content').value, '');
  assertEquals(when(0, 'content').value, '');
  assertEquals(when('', 'content').value, '');
});

Deno.test('when: works with SafeHtml input', () => {
  const result = when(true, raw('<b>Bold</b>'));
  assertEquals(result.value, '<b>Bold</b>');
});

// join tests
Deno.test('join: joins strings with separator', () => {
  const result = join(['a', 'b', 'c'], ', ');
  assertEquals(result.value, 'a, b, c');
});

Deno.test('join: handles SafeHtml items', () => {
  const result = join([raw('<li>One</li>'), raw('<li>Two</li>')], '\n');
  assertEquals(result.value, '<li>One</li>\n<li>Two</li>');
});

Deno.test('join: works without separator', () => {
  const result = join(['a', 'b', 'c']);
  assertEquals(result.value, 'abc');
});

// SafeHtml tests
Deno.test('SafeHtml: toString returns value', () => {
  const safe = new SafeHtml('<p>test</p>');
  assertEquals(safe.toString(), '<p>test</p>');
});
