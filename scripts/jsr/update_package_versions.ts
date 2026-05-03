// deno-lint-ignore-file no-console
/**
 * Updates the version number in all package deno.json files.
 *
 * Usage:
 *   deno run --allow-read --allow-write scripts/update_package_versions.ts --version 1.0.0
 */

const PACKAGES_DIR = new URL('../../packages', import.meta.url).pathname;
const ROOT_DENO_JSONC = new URL('../../deno.jsonc', import.meta.url).pathname;

interface DenoJson {
  name: string;
  version: string;
  [key: string]: unknown;
}

async function getPackageDirs(): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(PACKAGES_DIR)) {
    if (entry.isDirectory) {
      dirs.push(entry.name);
    }
  }
  return dirs.sort();
}

async function updatePackageVersion(
  packageName: string,
  newVersion: string,
): Promise<{ name: string; oldVersion: string; newVersion: string }> {
  const denoJsonPath = `${PACKAGES_DIR}/${packageName}/deno.jsonc`;

  const content = await Deno.readTextFile(denoJsonPath);
  const json: DenoJson = JSON.parse(content);

  const oldVersion = json.version;
  json.version = newVersion;

  // Preserve formatting: use 2-space indent and trailing newline
  await Deno.writeTextFile(denoJsonPath, JSON.stringify(json, null, 2) + '\n');

  return { name: json.name, oldVersion, newVersion };
}

async function updateRootVersion(
  newVersion: string,
): Promise<{ name: string; oldVersion: string; newVersion: string }> {
  const content = await Deno.readTextFile(ROOT_DENO_JSONC);

  // Extract current version using regex to preserve JSONC comments
  const versionMatch = content.match(/"version":\s*"([^"]+)"/);
  const oldVersion = versionMatch?.[1] ?? 'unknown';

  // Replace version in place to preserve comments and formatting
  const updatedContent = content.replace(
    /"version":\s*"[^"]+"/,
    `"version": "${newVersion}"`,
  );

  await Deno.writeTextFile(ROOT_DENO_JSONC, updatedContent);

  // Extract name for display
  const nameMatch = content.match(/"name":\s*"([^"]+)"/);
  const name = nameMatch?.[1] ?? 'root';

  return { name, oldVersion, newVersion };
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length !== 2 || args[0] !== '--version') {
    console.error(
      'Usage: deno run --allow-read --allow-write scripts/jsr/update_package_versions.ts --version <version>',
    );
    Deno.exit(1);
  }
  const version = args[1]!;

  const packageDirs = await getPackageDirs();

  console.log(
    `Updating ${packageDirs.length} packages + root to version ${version}\n`,
  );

  // Update root deno.jsonc first
  const rootResult = await updateRootVersion(version);
  console.log(
    `  ${rootResult.name}: ${rootResult.oldVersion} → ${rootResult.newVersion}`,
  );

  // Update each package
  for (const dir of packageDirs) {
    const result = await updatePackageVersion(dir, version);
    console.log(
      `  ${result.name}: ${result.oldVersion} → ${result.newVersion}`,
    );
  }

  console.log('\nDone!');
}
