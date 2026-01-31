# Publishing Workflow

## Overview

This monorepo uses a dual-config approach for JSR publishing:

- **`deno.jsonc`** — Development config with local paths (e.g., `"@hotsauce/core": "./packages/core/mod.ts"`)
- **`deno.jsr.jsonc`** — Publishing config with JSR specifiers (e.g., `"@hotsauce/core": "jsr:@hotsauce/core@0.1.0"`)

The pre-commit hook automatically keeps `deno.jsr.jsonc` in sync based on package versions.

## Version Bump Workflow

### 1. Update package versions

Edit each package's `deno.json` to bump the version:

```bash
# Update all packages to the same version
VERSION="0.2.0"
for pkg in packages/*/deno.json; do
  sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$pkg" && rm "$pkg.bak"
done
```

### 2. Commit changes

The pre-commit hook will automatically:

- Run `deno fmt --check` and `deno lint`
- Generate `deno.jsr.jsonc` with JSR paths for the new version
- Stage `deno.jsr.jsonc` for commit
- Run `deno task check`

```bash
git add packages/*/deno.json
git commit -m "chore: bump version to 0.2.0"
```

### 3. Tag and push

```bash
git tag v0.2.0
git push && git push --tags
```

The GitHub Actions workflow will:

- Verify tag is on main branch
- Verify all package versions match the tag
- Publish packages to JSR in dependency order using `deno.jsr.jsonc`

## Manual JSR Path Update

If you need to manually regenerate `deno.jsr.jsonc`:

```bash
deno task update-jsr-paths --version 0.2.0
```

## Files Involved

- **`.githooks/pre-commit`** — Git hook that auto-generates `deno.jsr.jsonc`
- **`scripts/update_jsr_paths.ts`** — Script that copies `deno.jsonc` → `deno.jsr.jsonc` and replaces paths
- **`.github/workflows/publish.yml`** — CI workflow for publishing to JSR
- **`deno.jsonc`** — Development config (never modified by scripts)
- **`deno.jsr.jsonc`** — Publishing config (auto-generated, committed)

## Why This Approach?

1. **Development uses local paths** — Fast, no network fetches, proper type-checking across packages
2. **Publishing uses JSR specifiers** — JSR can resolve dependencies correctly
3. **No dirty files during publish** — `deno.jsr.jsonc` is committed, no `--allow-dirty` needed
4. **Automatic sync** — Pre-commit hook ensures `deno.jsr.jsonc` always matches package versions
5. **Clear separation** — Development and publishing concerns are isolated

## Troubleshooting

### Pre-commit hook not running

Ensure hooks path is configured:

```bash
git config core.hooksPath .githooks
```

### Skip checks temporarily

```bash
SKIP_DENO_CHECKS=1 git commit -m "..."
```

### Version mismatch error during publish

The workflow verifies all packages have the same version as the git tag. Fix by updating package versions and re-tagging.
