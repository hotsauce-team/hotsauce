// Installs repo-managed git hooks into .git/hooks/ (opt-in).
//
// Usage:
//   deno run scripts/install_git_hooks.ts
//
// Note: This script intentionally avoids --allow-* flags.
// Deno will prompt for the minimal permissions needed.

const repoRoot = Deno.cwd();

const source = new URL('.githooks/pre-commit', `file://${repoRoot}/`).pathname;
const target = new URL('.git/hooks/pre-commit', `file://${repoRoot}/`).pathname;

const encoder = new TextEncoder();

function writeStdout(line: string): Promise<number> {
  return Deno.stdout.write(encoder.encode(`${line}\n`));
}

function writeStderr(line: string): Promise<number> {
  return Deno.stderr.write(encoder.encode(`${line}\n`));
}

async function main(): Promise<void> {
  try {
    const hook = await Deno.readTextFile(source);

    // Ensure .git/hooks exists
    await Deno.mkdir(new URL('.git/hooks', `file://${repoRoot}/`).pathname, {
      recursive: true,
    });

    await Deno.writeTextFile(target, hook);

    if (Deno.build.os !== 'windows') {
      await Deno.chmod(target, 0o755);
    }

    await writeStdout(`Installed git pre-commit hook to: ${target}`);
    await writeStdout('You can bypass it with SKIP_DENO_CHECKS=1.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeStderr(`Failed to install git hooks: ${message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
