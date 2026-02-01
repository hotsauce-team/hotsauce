// Replace lines in deno.jsonc to use JSR import paths
// e.g.
//   "@hotsauce/core": "./packages/core"
//    ->
//   "@hotsauce/core": "jsr:@hotsauce/core@<version>"

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
  ];

  for (const [pattern, replacement] of replacements) {
    denoJsonContent = denoJsonContent.replace(pattern, replacement);
  }

  await writeTextFile(denoJsonPath, denoJsonContent);
  console.log(`Updated deno.jsonc with JSR paths for version ${version}`);
}
