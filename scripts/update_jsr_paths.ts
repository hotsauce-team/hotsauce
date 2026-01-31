// Copy deno.jsonc to deno.jsr.jsonc and replace local paths with JSR import paths
// e.g.
//   "@hotsauce/core": "./packages/core"
//    ->
//   "@hotsauce/core": "jsr:@hotsauce/core@<version>"
//
// This should be run in a pre-commit hook to keep deno.jsr.jsonc in sync.

// deno-lint-ignore-file

import * as path from 'jsr:@std/path';

if (import.meta.main) {
  const { readTextFile, writeTextFile } = Deno;

  const args = Deno.args;
  if (args.length !== 2 || args[0] !== '--version') {
    console.error(
      'Usage: deno run --allow-read --allow-write scripts/update_jsr_paths.ts --version <version>',
    );
    Deno.exit(1);
  }
  const version = args[1];

  const denoJsonPath = path.join(Deno.cwd(), 'deno.jsonc');
  const denoJsrJsonPath = path.join(Deno.cwd(), 'deno.jsr.jsonc');
  let denoJsonContent = await readTextFile(denoJsonPath);

  const replacements: [RegExp, string][] = [
    [
      /@hotsauce\/core["']:\s*["']\.\/packages\/core\/mod\.ts["']/g,
      `@hotsauce/core": "jsr:@hotsauce/core@${version}"`,
    ],
    [
      /@hotsauce\/core\/extend["']:\s*["']\.\/packages\/core\/extend\/mod\.ts["']/g,
      `@hotsauce/core/extend": "jsr:@hotsauce/core@${version}/extend"`,
    ],
    [
      /@hotsauce\/workers["']:\s*["']\.\/packages\/workers\/mod\.ts["']/g,
      `@hotsauce/workers": "jsr:@hotsauce/workers@${version}"`,
    ],
    [
      /@hotsauce\/ui["']:\s*["']\.\/packages\/ui\/mod\.ts["']/g,
      `@hotsauce/ui": "jsr:@hotsauce/ui@${version}"`,
    ],
    [
      /@hotsauce\/auth["']:\s*["']\.\/packages\/auth\/mod\.ts["']/g,
      `@hotsauce/auth": "jsr:@hotsauce/auth@${version}"`,
    ],
    [
      /@hotsauce\/cms["']:\s*["']\.\/packages\/cms\/mod\.ts["']/g,
      `@hotsauce/cms": "jsr:@hotsauce/cms@${version}"`,
    ],
    [
      /@hotsauce\/plugins["']:\s*["']\.\/packages\/plugins\/mod\.ts["']/g,
      `@hotsauce/plugins": "jsr:@hotsauce/plugins@${version}"`,
    ],
  ];

  for (const [pattern, replacement] of replacements) {
    denoJsonContent = denoJsonContent.replace(pattern, replacement);
  }

  await writeTextFile(denoJsrJsonPath, denoJsonContent);
  console.log(`✓ Created deno.jsr.jsonc with JSR paths for version ${version}`);
  console.log('  Commit this file with your version bump.');
}
