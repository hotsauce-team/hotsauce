// Tests for HTML utilities

import { assertEquals } from '@std/assert';
import {
  attrs,
  escapeHtml,
  escapeUrlPath,
  getSafeUrl,
  html,
  join,
  raw,
  SafeHtml,
  stripHtmlTags,
  when,
} from '../html.ts';

// escapeHtml tests
Deno.test('escapeHtml: escapes HTML special characters', () => {
  assertEquals(escapeHtml('<script>'), '&lt;script&gt;');
  assertEquals(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assertEquals(escapeHtml("it's"), 'it&#039;s');
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

// stripHtmlTags tests
Deno.test('stripHtmlTags: removes HTML tags, keeps text content', () => {
  assertEquals(stripHtmlTags('<p>Hello world</p>'), 'Hello world');
  assertEquals(
    stripHtmlTags('<strong>Bold</strong> and <em>italic</em>'),
    'Bold and italic',
  );
  assertEquals(
    stripHtmlTags('<a href="/x">link</a>'),
    'link',
  );
});

Deno.test('stripHtmlTags: leaves plain text untouched', () => {
  assertEquals(stripHtmlTags('just text'), 'just text');
  assertEquals(stripHtmlTags(''), '');
});

Deno.test('stripHtmlTags: handles null and undefined', () => {
  assertEquals(stripHtmlTags(null), '');
  assertEquals(stripHtmlTags(undefined), '');
});

Deno.test('stripHtmlTags: removes self-closing and multiline tags', () => {
  assertEquals(stripHtmlTags('a<br/>b'), 'ab');
  assertEquals(stripHtmlTags('x<div\n class="y">z</div>'), 'xz');
});

// escapeUrlPath tests
Deno.test('escapeUrlPath: encodes special URL characters', () => {
  assertEquals(escapeUrlPath('hello world'), 'hello%20world');
  assertEquals(escapeUrlPath('a/b'), 'a%2Fb');
  assertEquals(escapeUrlPath('a?b=c'), 'a%3Fb%3Dc');
  assertEquals(escapeUrlPath('table"name'), 'table%22name');
});

Deno.test('escapeUrlPath: handles path traversal attempts', () => {
  assertEquals(escapeUrlPath('../etc/passwd'), '..%2Fetc%2Fpasswd');
  assertEquals(escapeUrlPath('..'), '..');
  assertEquals(escapeUrlPath('.'), '.');
});

Deno.test('escapeUrlPath: handles null and undefined', () => {
  assertEquals(escapeUrlPath(null), '');
  assertEquals(escapeUrlPath(undefined), '');
});

Deno.test('escapeUrlPath: converts non-strings to string', () => {
  assertEquals(escapeUrlPath(123), '123');
  assertEquals(escapeUrlPath(true), 'true');
});

// html tagged template tests
Deno.test('html: escapes interpolated values', () => {
  const userInput = '<script>alert("xss")</script>';
  // deno-fmt-ignore
  const result = html`<p>${userInput}</p>`;
  assertEquals(
    result,
    '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>',
  );
});

Deno.test('html: preserves raw() content', () => {
  const trustedHtml = raw('<strong>Bold</strong>');
  // deno-fmt-ignore
  const result = html`<p>${trustedHtml}</p>`;
  assertEquals(result, '<p><strong>Bold</strong></p>');
});

Deno.test('html: handles arrays', () => {
  const items = ['<a>', '<b>', '<c>'];
  // deno-fmt-ignore
  const result = html`<ul>${items}</ul>`;
  assertEquals(result, '<ul>&lt;a&gt;&lt;b&gt;&lt;c&gt;</ul>');
});

Deno.test('html: handles arrays with raw items', () => {
  const items = [raw('<li>One</li>'), raw('<li>Two</li>')];
  // deno-fmt-ignore
  const result = html`<ul>${items}</ul>`;
  assertEquals(result, '<ul><li>One</li><li>Two</li></ul>');
});

Deno.test('html: handles multiple interpolations', () => {
  const name = 'John';
  const age = 30;
  // deno-fmt-ignore
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

// =============================================================================
// getSafeUrl tests
// =============================================================================

Deno.test('getSafeUrl: allows relative paths', () => {
  assertEquals(getSafeUrl('/files/posts/avatar/1/photo.png') !== null, true);
  assertEquals(getSafeUrl('photo.png') !== null, true);
  assertEquals(getSafeUrl('./photo.png') !== null, true);
});

Deno.test('getSafeUrl: returns trimmed URL', () => {
  assertEquals(getSafeUrl('  /path  '), '/path');
});

Deno.test('getSafeUrl: allows http and https', () => {
  assertEquals(getSafeUrl('https://cdn.example.com/photo.png') !== null, true);
  assertEquals(getSafeUrl('http://cdn.example.com/photo.png') !== null, true);
  assertEquals(getSafeUrl('HTTPS://CDN.EXAMPLE.COM/PHOTO.PNG') !== null, true);
});

Deno.test('getSafeUrl: blocks javascript: scheme', () => {
  assertEquals(getSafeUrl('javascript:alert(1)'), null);
  assertEquals(getSafeUrl('JAVASCRIPT:alert(1)'), null);
  assertEquals(getSafeUrl('JavaScript:alert(document.cookie)'), null);
});

Deno.test('getSafeUrl: blocks data: scheme', () => {
  assertEquals(getSafeUrl('data:text/html,<script>alert(1)</script>'), null);
});

Deno.test('getSafeUrl: blocks scheme-relative URLs', () => {
  assertEquals(getSafeUrl('//evil.com/tracker.png'), null);
});

Deno.test('getSafeUrl: blocks control characters', () => {
  assertEquals(getSafeUrl('\x00javascript:alert(1)'), null);
  assertEquals(getSafeUrl('java\x00script:alert(1)'), null);
  assertEquals(getSafeUrl('http://evil\x00.com'), null);
});

Deno.test('getSafeUrl: blocks percent-encoded control characters', () => {
  assertEquals(getSafeUrl('%0dhttp://evil.com'), null);
  assertEquals(getSafeUrl('%0ahttp://evil.com'), null);
});

Deno.test('getSafeUrl: blocks other schemes', () => {
  assertEquals(getSafeUrl('vbscript:msgbox'), null);
  assertEquals(getSafeUrl('file:///etc/passwd'), null);
  assertEquals(getSafeUrl('ftp://evil.com/file'), null);
});

Deno.test('getSafeUrl: rejects empty and whitespace-only', () => {
  assertEquals(getSafeUrl(''), null);
  assertEquals(getSafeUrl('   '), null);
});
