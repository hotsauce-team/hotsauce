/**
 * Build npm packages using dnt (Deno to Node transform)
 *
 * Usage: deno run -A scripts/npm/build_npm.ts [version]
 *
 * This script builds @hotsauce/core, @hotsauce/ui, @hotsauce/auth, @hotsauce/cms,
 * @hotsauce/plugins-fs-storage, and @hotsauce/plugins-s3-storage packages for
 * npm distribution. Tests are NOT run during build - use npm-tests/ for Node.js
 * e2e testing.
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
  skipNpmInstall: true, // Don't run npm install - we'll handle this manually after build
};

const repoUrl = 'https://github.com/hotsauce-team/hotsauce.git';
const repoUrlShort = 'https://github.com/hotsauce-team/hotsauce';

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/core
// ─────────────────────────────────────────────────────────────
console.log('\n[1/6] Building @hotsauce/core...');
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
console.log('\n[2/6] Building @hotsauce/ui...');
await emptyDir('./npm/ui');
await build({
  ...sharedOptions,
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
console.log('\n[3/6] Building @hotsauce/auth...');
await emptyDir('./npm/auth');
await build({
  ...sharedOptions,
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
console.log('\n[4/6] Building @hotsauce/cms...');
await emptyDir('./npm/cms');
await build({
  ...sharedOptions,
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

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/plugins-fs-storage
//
// Scoped to the fs-storage plugin only — building the whole @hotsauce/plugins
// package would pull in the browser-targeting puck/React code, which has no
// place in a Node build. This package mainly exists so npm-tests/ can exercise
// the disk adapter's node:fs/promises branch on real Node.
// ─────────────────────────────────────────────────────────────
console.log('\n[5/6] Building @hotsauce/plugins-fs-storage...');
await emptyDir('./npm/plugins-fs-storage');
await build({
  ...sharedOptions,
  entryPoints: [
    './packages/plugins/fs-storage/mod.ts',
    {
      name: './types',
      path: './packages/plugins/fs-storage/types.ts',
    },
  ],
  outDir: './npm/plugins-fs-storage',
  package: {
    name: '@hotsauce/plugins-fs-storage',
    version,
    description: 'Filesystem-backed file storage plugin for @hotsauce/cms',
    license: 'MIT',
    repository: {
      type: 'git',
      url: repoUrl,
      directory: 'packages/plugins/fs-storage',
    },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
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
    [`${baseUrl}/packages/cms/mod.ts`]: {
      name: '@hotsauce/cms',
      version: `>=${version}`,
    },
  },
  postBuild() {
    Deno.copyFileSync(
      'packages/plugins/LICENSE',
      'npm/plugins-fs-storage/LICENSE',
    );
    Deno.copyFileSync(
      'packages/plugins/fs-storage/README.md',
      'npm/plugins-fs-storage/README.md',
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Build @hotsauce/plugins-s3-storage
//
// Scoped to the s3-storage plugin only, for the same reason as fs-storage
// above: the parent @hotsauce/plugins package pulls in browser-targeting
// puck/React code. Pure fetch + Web Crypto, so no shims are needed.
// ─────────────────────────────────────────────────────────────
console.log('\n[6/6] Building @hotsauce/plugins-s3-storage...');
await emptyDir('./npm/plugins-s3-storage');
await build({
  ...sharedOptions,
  entryPoints: [
    './packages/plugins/s3-storage/mod.ts',
    {
      name: './types',
      path: './packages/plugins/s3-storage/types.ts',
    },
    {
      // Standalone SigV4 utilities (mirrors the JSR ./s3-storage/signing export)
      name: './signing',
      path: './packages/plugins/s3-storage/signing.ts',
    },
  ],
  outDir: './npm/plugins-s3-storage',
  package: {
    name: '@hotsauce/plugins-s3-storage',
    version,
    description:
      'S3-compatible object storage plugin for @hotsauce/cms (AWS S3, MinIO, R2, ...)',
    license: 'MIT',
    repository: {
      type: 'git',
      url: repoUrl,
      directory: 'packages/plugins/s3-storage',
    },
    bugs: { url: `${repoUrlShort}/issues` },
    engines: { node: '>=20.0.0' },
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
    [`${baseUrl}/packages/cms/mod.ts`]: {
      name: '@hotsauce/cms',
      version: `>=${version}`,
    },
  },
  postBuild() {
    Deno.copyFileSync(
      'packages/plugins/LICENSE',
      'npm/plugins-s3-storage/LICENSE',
    );
    Deno.copyFileSync(
      'packages/plugins/s3-storage/README.md',
      'npm/plugins-s3-storage/README.md',
    );
  },
});

console.log('\n✅ All packages built successfully!');
console.log(
  '   npm/core, npm/ui, npm/auth, npm/cms, npm/plugins-fs-storage, npm/plugins-s3-storage',
);
