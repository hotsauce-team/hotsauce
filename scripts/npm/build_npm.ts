/**
 * Build npm packages using dnt (Deno to Node transform)
 *
 * Usage: deno run -A scripts/build_npm.ts [version]
 *
 * This script builds @hotsauce/core, @hotsauce/ui, @hotsauce/auth, and @hotsauce/cms
 * packages for npm distribution. Tests are NOT run during build - use npm-tests/
 * for Node.js e2e testing.
 */

import { build, emptyDir } from 'jsr:@deno/dnt@0.42.3';
import { parse } from 'jsr:@std/jsonc';

// Get version from CLI arg or deno.jsonc
async function getVersion(): Promise<string> {
  if (Deno.args[0]) {
    return Deno.args[0].replace(/^v/, '');
  }
  const content = await Deno.readTextFile('deno.jsonc');
  const config = parse(content) as { version: string };
  return config.version;
}

const version = await getVersion();
const cwd = Deno.cwd();
const baseUrl = `file://${cwd}`;

console.log(`Building npm packages version ${version}...`);

// Shared build options
const sharedOptions = {
  test: false, // Don't run tests - use npm-tests/ instead
  typeCheck: false as const, // Skip type checking (avoids npm install issues with unpublished deps)
  scriptModule: false as const, // ESM only, no CommonJS
  shims: {}, // No shims - packages use Web Standard APIs only
};

const repoUrl = 'https://github.com/hotsauce-team/hotsauce.git';
const repoUrlShort = 'https://github.com/hotsauce-team/hotsauce';

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/core
// ─────────────────────────────────────────────────────────────
console.log('\n[1/4] Building @hotsauce/core...');
await emptyDir('./npm/core');
await build({
  ...sharedOptions,
  entryPoints: [
    './packages/core/mod.ts',
    { name: './extend', path: './packages/core/extend/mod.ts' },
  ],
  outDir: './npm/core',
  package: {
    name: '@hotsauce/core',
    version,
    description:
      'Schema introspection, field mapping, and validation for Drizzle ORM',
    license: 'MIT',
    repository: { type: 'git', url: repoUrl, directory: 'packages/core' },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
    peerDependencies: {
      'drizzle-orm': '>=0.35.0',
      zod: '>=3.20.0',
    },
    peerDependenciesMeta: {
      'drizzle-zod': { optional: true },
    },
  },
  postBuild() {
    Deno.copyFileSync('packages/core/LICENSE', 'npm/core/LICENSE');
    Deno.copyFileSync('packages/core/README.md', 'npm/core/README.md');
  },
});

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/ui
// ─────────────────────────────────────────────────────────────
console.log('\n[2/4] Building @hotsauce/ui...');
await emptyDir('./npm/ui');
await build({
  ...sharedOptions,
  skipNpmInstall: true, // @hotsauce/core not on npm yet
  entryPoints: ['./packages/ui/mod.ts'],
  outDir: './npm/ui',
  package: {
    name: '@hotsauce/ui',
    version,
    description: 'HTML generation, form rendering, and view components',
    license: 'MIT',
    repository: { type: 'git', url: repoUrl, directory: 'packages/ui' },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
  },
  mappings: {
    // Map the resolved file paths to npm packages
    [`${baseUrl}/packages/core/mod.ts`]: {
      name: '@hotsauce/core',
      version: `>=${version}`,
    },
  },
  postBuild() {
    Deno.copyFileSync('packages/ui/LICENSE', 'npm/ui/LICENSE');
    Deno.copyFileSync('packages/ui/README.md', 'npm/ui/README.md');
  },
});

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/auth
// ─────────────────────────────────────────────────────────────
console.log('\n[3/4] Building @hotsauce/auth...');
await emptyDir('./npm/auth');
await build({
  ...sharedOptions,
  skipNpmInstall: true, // @hotsauce/* deps not on npm yet
  entryPoints: ['./packages/auth/mod.ts'],
  outDir: './npm/auth',
  package: {
    name: '@hotsauce/auth',
    version,
    description: 'Authentication: JWT, password hashing, TOTP 2FA',
    license: 'MIT',
    repository: { type: 'git', url: repoUrl, directory: 'packages/auth' },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
  },
  mappings: {
    [`${baseUrl}/packages/ui/mod.ts`]: {
      name: '@hotsauce/ui',
      version: `>=${version}`,
    },
  },
  postBuild() {
    Deno.copyFileSync('packages/auth/LICENSE', 'npm/auth/LICENSE');
    Deno.copyFileSync('packages/auth/README.md', 'npm/auth/README.md');
  },
});

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/cms
// ─────────────────────────────────────────────────────────────
console.log('\n[4/4] Building @hotsauce/cms...');
await emptyDir('./npm/cms');
await build({
  ...sharedOptions,
  skipNpmInstall: true, // @hotsauce/* deps not on npm yet
  entryPoints: ['./packages/cms/mod.ts'],
  outDir: './npm/cms',
  package: {
    name: '@hotsauce/cms',
    version,
    description: 'CRUD route handlers for Drizzle ORM schemas',
    license: 'MIT',
    repository: { type: 'git', url: repoUrl, directory: 'packages/cms' },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
    peerDependencies: {
      'drizzle-orm': '>=0.35.0',
      zod: '>=3.20.0',
    },
  },
  mappings: {
    [`${baseUrl}/packages/core/mod.ts`]: {
      name: '@hotsauce/core',
      version: `>=${version}`,
    },
    [`${baseUrl}/packages/ui/mod.ts`]: {
      name: '@hotsauce/ui',
      version: `>=${version}`,
    },
    [`${baseUrl}/packages/auth/mod.ts`]: {
      name: '@hotsauce/auth',
      version: `>=${version}`,
    },
  },
  postBuild() {
    Deno.copyFileSync('packages/cms/LICENSE', 'npm/cms/LICENSE');
    Deno.copyFileSync('packages/cms/README.md', 'npm/cms/README.md');
  },
});

console.log('\n✅ All packages built successfully!');
console.log('   npm/core, npm/ui, npm/auth, npm/cms');
