// Tests for storage utilities

import { assertEquals } from 'jsr:@std/assert';
import {
  generateUniqueFilename,
  sanitizePath,
  getFileExtension,
  isAllowedMimeType,
  formatFileSize,
} from '../storage.ts';

// =============================================================================
// generateUniqueFilename tests
// =============================================================================

Deno.test('generateUniqueFilename: preserves extension', () => {
  const result = generateUniqueFilename('photo.jpg');
  
  assertEquals(result.endsWith('.jpg'), true);
});

Deno.test('generateUniqueFilename: handles no extension', () => {
  const result = generateUniqueFilename('README');
  
  // Should not have trailing dot
  assertEquals(result.includes('.'), false);
});

Deno.test('generateUniqueFilename: sanitizes special characters', () => {
  const result = generateUniqueFilename('my file (1).png');
  
  // Should not contain spaces or parentheses
  assertEquals(result.includes(' '), false);
  assertEquals(result.includes('('), false);
  assertEquals(result.includes(')'), false);
});

Deno.test('generateUniqueFilename: generates unique names', () => {
  const result1 = generateUniqueFilename('test.jpg');
  const result2 = generateUniqueFilename('test.jpg');
  
  // Should be different due to timestamp/random
  // Note: this could theoretically fail if both run in same millisecond
  // with same random, but probability is negligible
  assertEquals(result1 !== result2, true);
});

Deno.test('generateUniqueFilename: truncates long names', () => {
  const longName = 'a'.repeat(100) + '.png';
  const result = generateUniqueFilename(longName);
  
  // Base name should be truncated to 50 chars, plus timestamp, random, extension
  // Total should be reasonable length
  assertEquals(result.length < 100, true);
});

// =============================================================================
// sanitizePath tests
// =============================================================================

Deno.test('sanitizePath: removes directory traversal', () => {
  const result = sanitizePath('../../../etc/passwd');
  
  assertEquals(result.includes('..'), false);
});

Deno.test('sanitizePath: removes leading slashes', () => {
  const result = sanitizePath('/uploads/image.jpg');
  
  assertEquals(result.startsWith('/'), false);
  assertEquals(result, 'uploads/image.jpg');
});

Deno.test('sanitizePath: normalizes multiple slashes', () => {
  const result = sanitizePath('uploads//images///photo.jpg');
  
  assertEquals(result.includes('//'), false);
  assertEquals(result, 'uploads/images/photo.jpg');
});

Deno.test('sanitizePath: handles complex attack paths', () => {
  const result = sanitizePath('/../uploads/../../../etc/passwd');
  
  assertEquals(result.includes('..'), false);
  assertEquals(result.includes('etc'), true); // The filename part is kept
});

// =============================================================================
// getFileExtension tests
// =============================================================================

Deno.test('getFileExtension: extracts extension', () => {
  assertEquals(getFileExtension('photo.jpg'), 'jpg');
  assertEquals(getFileExtension('document.PDF'), 'pdf'); // lowercase
  assertEquals(getFileExtension('archive.tar.gz'), 'gz');
});

Deno.test('getFileExtension: handles no extension', () => {
  assertEquals(getFileExtension('README'), '');
  assertEquals(getFileExtension('Makefile'), '');
});

Deno.test('getFileExtension: handles edge cases', () => {
  // Dotfiles: the dot position (0) is not > 0, so returns empty
  assertEquals(getFileExtension('.gitignore'), '');
  assertEquals(getFileExtension('file.'), '');
});

// =============================================================================
// isAllowedMimeType tests
// =============================================================================

Deno.test('isAllowedMimeType: exact match', () => {
  const allowed = ['image/png', 'image/jpeg'];
  
  assertEquals(isAllowedMimeType('image/png', allowed), true);
  assertEquals(isAllowedMimeType('image/gif', allowed), false);
});

Deno.test('isAllowedMimeType: wildcard type', () => {
  const allowed = ['image/*'];
  
  assertEquals(isAllowedMimeType('image/png', allowed), true);
  assertEquals(isAllowedMimeType('image/jpeg', allowed), true);
  assertEquals(isAllowedMimeType('image/gif', allowed), true);
  assertEquals(isAllowedMimeType('application/pdf', allowed), false);
});

Deno.test('isAllowedMimeType: universal wildcard', () => {
  assertEquals(isAllowedMimeType('anything/here', ['*']), true);
  assertEquals(isAllowedMimeType('video/mp4', ['*/*']), true);
});

Deno.test('isAllowedMimeType: mixed patterns', () => {
  const allowed = ['image/*', 'application/pdf', 'text/plain'];
  
  assertEquals(isAllowedMimeType('image/webp', allowed), true);
  assertEquals(isAllowedMimeType('application/pdf', allowed), true);
  assertEquals(isAllowedMimeType('text/plain', allowed), true);
  assertEquals(isAllowedMimeType('text/html', allowed), false);
  assertEquals(isAllowedMimeType('application/json', allowed), false);
});

// =============================================================================
// formatFileSize tests
// =============================================================================

Deno.test('formatFileSize: bytes', () => {
  assertEquals(formatFileSize(0), '0 B');
  assertEquals(formatFileSize(512), '512 B');
  assertEquals(formatFileSize(1023), '1023 B');
});

Deno.test('formatFileSize: kilobytes', () => {
  assertEquals(formatFileSize(1024), '1.0 KB');
  assertEquals(formatFileSize(1536), '1.5 KB');
  assertEquals(formatFileSize(1024 * 100), '100.0 KB');
});

Deno.test('formatFileSize: megabytes', () => {
  assertEquals(formatFileSize(1024 * 1024), '1.0 MB');
  assertEquals(formatFileSize(1024 * 1024 * 5), '5.0 MB');
  assertEquals(formatFileSize(1024 * 1024 * 2.5), '2.5 MB');
});

Deno.test('formatFileSize: gigabytes', () => {
  assertEquals(formatFileSize(1024 * 1024 * 1024), '1.0 GB');
  assertEquals(formatFileSize(1024 * 1024 * 1024 * 2.5), '2.5 GB');
});
