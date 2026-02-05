// Tests for update_jsr_paths.ts
// Run with: deno test -P scripts/update_jsr_paths_test.ts

import { assertEquals } from '@std/assert';

// Test the regex replacements work as expected
Deno.test('update_jsr_paths: replaces @hotsauce/core path', () => {
  const input = '"@hotsauce/core": "./packages/core/mod.ts"';
  const expected = '"jsr:@hotsauce/core@0.1.0';

  const pattern = /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/core@0.1.0';

  const result = input.replace(pattern, replacement);
  assertEquals(result, expected);
});

Deno.test('update_jsr_paths: replaces @hotsauce/core/extend path', () => {
  const input = '"@hotsauce/core/extend": "./packages/core/extend/mod.ts"';
  const expected = '"jsr:@hotsauce/core@0.1.0/extend';

  const pattern =
    /@hotsauce\/core\/extend["']:\s*["']\.\/packages\/core\/extend\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/core@0.1.0/extend';

  const result = input.replace(pattern, replacement);
  assertEquals(result, expected);
});

Deno.test('update_jsr_paths: replaces @hotsauce/workers path', () => {
  const input = '"@hotsauce/workers": "./packages/workers/mod.ts"';
  const expected = '"jsr:@hotsauce/workers@0.1.0';

  const pattern =
    /@hotsauce\/workers["']:\s*["']\.\/packages\/workers\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/workers@0.1.0';

  const result = input.replace(pattern, replacement);
  assertEquals(result, expected);
});

Deno.test('update_jsr_paths: handles single quotes', () => {
  const input = "'@hotsauce/core': './packages/core/mod.ts'";
  const expected = "'jsr:@hotsauce/core@0.1.0";

  const pattern = /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/core@0.1.0';

  const result = input.replace(pattern, replacement);
  assertEquals(result, expected);
});

Deno.test('update_jsr_paths: does not match without colon separator', () => {
  const input = '"@hotsauce/core" "./packages/core/mod.ts"';

  const pattern = /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/core@0.1.0';

  const result = input.replace(pattern, replacement);
  assertEquals(result, input); // Should remain unchanged
});

Deno.test('update_jsr_paths: does not replace already-updated paths', () => {
  const input = '"@hotsauce/core": "jsr:@hotsauce/core@0.1.0"';

  const pattern = /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g;
  const replacement = 'jsr:@hotsauce/core@0.2.0';

  const result = input.replace(pattern, replacement);
  assertEquals(result, input); // Should remain unchanged
});

Deno.test('update_jsr_paths: handles multiple replacements in one string', () => {
  const input = `{
  "@hotsauce/core": "./packages/core/mod.ts",
  "@hotsauce/workers": "./packages/workers/mod.ts"
}`;

  const expected = `{
  "jsr:@hotsauce/core@0.1.0,
  "jsr:@hotsauce/workers@0.1.0
}`;

  let result = input;
  result = result.replace(
    /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g,
    'jsr:@hotsauce/core@0.1.0',
  );
  result = result.replace(
    /@hotsauce\/workers["']:\s*["']\.\/packages\/workers\/mod\.ts["']/g,
    'jsr:@hotsauce/workers@0.1.0',
  );

  assertEquals(result, expected);
});

Deno.test('update_jsr_paths: preserves unmatched lines', () => {
  const input = `{
  "imports": {
    "@hotsauce/core": "./packages/core/mod.ts",
    "@hotsauce/ui": "./packages/ui/mod.ts"
  }
}`;

  const expected = `{
  "imports": {
    "jsr:@hotsauce/core@0.1.0,
    "@hotsauce/ui": "./packages/ui/mod.ts"
  }
}`;

  const result = input.replace(
    /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g,
    'jsr:@hotsauce/core@0.1.0',
  );

  assertEquals(result, expected);
});
