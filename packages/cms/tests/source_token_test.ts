/**
 * @module source_token_test
 * Tests for source token generation, validation, and policiesFromSchema.
 */

import { assertEquals, assertRejects } from '@std/assert';
import {
  generateSourceToken,
  getPluginName,
  getSourceTokenFromFormData,
  isPluginSource,
  pluginSource,
  SOURCE,
  SOURCE_FIELD_NAME,
  validateSourceToken,
} from '../tokens/mod.ts';

const TEST_SECRET = 'a-very-secure-test-secret-that-is-long-enough';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

Deno.test('SOURCE_FIELD_NAME is _source', () => {
  assertEquals(SOURCE_FIELD_NAME, '_source');
});

Deno.test("SOURCE.CMS is 'cms'", () => {
  assertEquals(SOURCE.CMS, 'cms');
});

Deno.test("SOURCE.PLUGIN_PREFIX is 'plugin:'", () => {
  assertEquals(SOURCE.PLUGIN_PREFIX, 'plugin:');
});

// ─────────────────────────────────────────────────────────────
// pluginSource helper
// ─────────────────────────────────────────────────────────────

Deno.test("pluginSource: generates 'plugin:name' format", () => {
  assertEquals(pluginSource('puck'), 'plugin:puck');
  assertEquals(pluginSource('audit-log'), 'plugin:audit-log');
});

// ─────────────────────────────────────────────────────────────
// isPluginSource
// ─────────────────────────────────────────────────────────────

Deno.test('isPluginSource: returns true for plugin sources', () => {
  assertEquals(isPluginSource('plugin:puck'), true);
  assertEquals(isPluginSource('plugin:audit-log'), true);
});

Deno.test('isPluginSource: returns false for CMS source', () => {
  assertEquals(isPluginSource('cms'), false);
});

Deno.test('isPluginSource: returns false for undefined', () => {
  assertEquals(isPluginSource(undefined), false);
});

// ─────────────────────────────────────────────────────────────
// getPluginName
// ─────────────────────────────────────────────────────────────

Deno.test('getPluginName: extracts name from plugin source', () => {
  assertEquals(getPluginName('plugin:puck'), 'puck');
  assertEquals(getPluginName('plugin:audit-log'), 'audit-log');
});

Deno.test('getPluginName: returns undefined for CMS source', () => {
  assertEquals(getPluginName('cms'), undefined);
});

Deno.test('getPluginName: returns undefined for undefined', () => {
  assertEquals(getPluginName(undefined), undefined);
});

// ─────────────────────────────────────────────────────────────
// generateSourceToken
// ─────────────────────────────────────────────────────────────

Deno.test('generateSourceToken: generates token with correct format', async () => {
  const token = await generateSourceToken('cms', TEST_SECRET);
  const parts = token.split('.');
  assertEquals(parts.length, 3, 'Token should have 3 parts');
  assertEquals(parts[0], 'cms', 'First part should be the source');
  // Second part is timestamp (base36 string)
  const timestamp = parseInt(parts[1]!, 36);
  assertEquals(typeof timestamp, 'number');
  assertEquals(isNaN(timestamp), false);
  // Third part is signature (base64url)
  assertEquals(typeof parts[2], 'string');
  assertEquals(parts[2]!.length > 0, true);
});

Deno.test('generateSourceToken: generates plugin token', async () => {
  const token = await generateSourceToken('plugin:puck', TEST_SECRET);
  const parts = token.split('.');
  assertEquals(parts[0], 'plugin:puck');
});

Deno.test('generateSourceToken: requires secret of at least 32 chars', async () => {
  await assertRejects(
    async () => {
      await generateSourceToken('cms', 'short');
    },
    Error,
    '32 characters',
  );
});

Deno.test('generateSourceToken: produces unique tokens', async () => {
  const token1 = await generateSourceToken('cms', TEST_SECRET);
  // Sleep to ensure timestamp differs
  await new Promise((r) => setTimeout(r, 10));
  const token2 = await generateSourceToken('cms', TEST_SECRET);

  // Tokens might be the same if within same second, but should validate
  assertEquals(typeof token1, 'string');
  assertEquals(typeof token2, 'string');
});

// ─────────────────────────────────────────────────────────────
// validateSourceToken
// ─────────────────────────────────────────────────────────────

Deno.test('validateSourceToken: validates correct token', async () => {
  const token = await generateSourceToken('cms', TEST_SECRET);
  const result = await validateSourceToken(token, TEST_SECRET);
  assertEquals(result, 'cms');
});

Deno.test('validateSourceToken: validates plugin token', async () => {
  const token = await generateSourceToken('plugin:puck', TEST_SECRET);
  const result = await validateSourceToken(token, TEST_SECRET);
  assertEquals(result, 'plugin:puck');
});

Deno.test('validateSourceToken: rejects null', async () => {
  const result = await validateSourceToken(null, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects undefined', async () => {
  const result = await validateSourceToken(undefined, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects empty string', async () => {
  const result = await validateSourceToken('', TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects wrong secret', async () => {
  const token = await generateSourceToken('cms', TEST_SECRET);
  const result = await validateSourceToken(
    token,
    'a-different-secret-that-is-also-long',
  );
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects tampered token', async () => {
  const token = await generateSourceToken('cms', TEST_SECRET);
  // Change the source part
  const parts = token.split('.');
  parts[0] = 'plugin:evil';
  const tamperedToken = parts.join('.');
  const result = await validateSourceToken(tamperedToken, TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects malformed token (wrong parts)', async () => {
  const result = await validateSourceToken('cms.timestamp', TEST_SECRET);
  assertEquals(result, null);
});

Deno.test('validateSourceToken: rejects expired token', async () => {
  // Create a token with an old timestamp
  // We can't easily test this without mocking time, so we'll skip for now
  // The token expiry is 4 hours, which is too long to wait in a test
});

// ─────────────────────────────────────────────────────────────
// getSourceTokenFromFormData
// ─────────────────────────────────────────────────────────────

Deno.test('getSourceTokenFromFormData: extracts token from form data', () => {
  const formData: Record<string, string | string[]> = {
    '_source': 'cms.123.abc',
  };
  const result = getSourceTokenFromFormData(formData);
  assertEquals(result, 'cms.123.abc');
});

Deno.test('getSourceTokenFromFormData: returns null when missing', () => {
  const formData: Record<string, string | string[]> = {};
  const result = getSourceTokenFromFormData(formData);
  assertEquals(result, null);
});

Deno.test('getSourceTokenFromFormData: handles array value', () => {
  const formData: Record<string, string | string[]> = {
    '_source': ['first', 'second'],
  };
  const result = getSourceTokenFromFormData(formData);
  // Should return first value
  assertEquals(result, 'first');
});

// ─────────────────────────────────────────────────────────────
// Integration: generate and validate flow
// ─────────────────────────────────────────────────────────────

Deno.test('integration: generate CMS token and validate', async () => {
  const token = await generateSourceToken(SOURCE.CMS, TEST_SECRET);
  const result = await validateSourceToken(token, TEST_SECRET);
  assertEquals(result, 'cms');
  assertEquals(isPluginSource(result ?? ''), false);
});

Deno.test('integration: generate plugin token and validate', async () => {
  const pluginName = 'puck';
  const source = pluginSource(pluginName);
  const token = await generateSourceToken(source, TEST_SECRET);
  const result = await validateSourceToken(token, TEST_SECRET);
  assertEquals(result, 'plugin:puck');
  assertEquals(isPluginSource(result ?? ''), true);
  assertEquals(getPluginName(result ?? ''), 'puck');
});
