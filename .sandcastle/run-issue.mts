// Sandcastle orchestration for the "Agent on Issue" workflow.
//
// Driven by the MODE env var set in .github/workflows/agent-on-issue.yml:
//   explore   -> read-only research; writes triage notes to .sandcastle/triage-notes.md
//   implement -> implements the change on a branch and pushes it
//
// Verified against @ai-hero/sandcastle@0.10.0:
//   docker({ imageName })               -> sandboxes/docker export
//   claudeCode(model, { effort, env })
//   run(...) -> RunResult { commits: { sha }[]; branch: string }
//   branchStrategy: { type: "head" } | { type: "branch", branch }
//
// Runs the agent in a Docker container (sandcastle's intended model): the
// container is the safety boundary, so sandcastle passes
// --dangerously-skip-permissions for us and the agent runs headlessly. We do
// NOT set permissionMode (that would suppress the skip flag and re-introduce
// interactive approval prompts that hang in CI).
import { claudeCode, run } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// Must match the image tag built in the workflow.
const IMAGE = 'hotsauce-agent';

// Run a git command on the host and return its trimmed stdout.
const sh = (cmd: string) => execSync(cmd, { encoding: 'utf8' }).trim();

const mode = process.env.MODE === 'explore' ? 'explore' : 'implement';
const issue = process.env.ISSUE_NUMBER;
if (!issue) throw new Error('ISSUE_NUMBER env var is required');

// Credentials forwarded into the container for the Claude Code CLI.
const agentEnv: Record<string, string> = {};
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  agentEnv.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

const out = process.env.GITHUB_OUTPUT;
const setOutput = (line: string) => {
  if (out) appendFileSync(out, `${line}\n`);
};

const ctx = [
  `Issue #${issue}`,
  `Title: ${process.env.ISSUE_TITLE ?? '(no title)'}`,
  `Body:`,
  process.env.ISSUE_BODY ?? '(no description)',
].join('\n');

if (mode === 'explore') {
  // Research only. The prompt asks the agent not to change source files, and we
  // never push or open a PR here, so any stray writes are discarded with the
  // ephemeral container/runner.
  await run({
    agent: claudeCode('claude-opus-4-8', { effort: 'high', env: agentEnv }),
    sandbox: docker({ imageName: IMAGE }),
    branchStrategy: { type: 'head' },
    logging: { type: 'stdout' },
    prompt: `${ctx}

Research this issue in the repo WITHOUT changing any source files. Investigate the
root cause, the affected files, and a recommended implementation approach. Write your
findings as markdown to \`.sandcastle/triage-notes.md\` (create the file).
When done, output <promise>COMPLETE</promise>.`,
  });
  setOutput('mode=explore');
} else {
  // Head mode: the agent works in the main checkout (no worktree). The "branch"
  // strategy creates a git worktree under .sandcastle/worktrees/, whose .git
  // linkage doesn't survive the docker bind-mount round-trip ("is not a working
  // tree" on cleanup). Head mode needs no worktree; sandcastle has no auto-commit
  // either, so we commit the working-tree changes and publish them ourselves.
  const baseSha = sh('git rev-parse HEAD');
  await run({
    agent: claudeCode('claude-opus-4-8', { effort: 'high', env: agentEnv }),
    sandbox: docker({ imageName: IMAGE }),
    branchStrategy: { type: 'head' },
    logging: { type: 'stdout' },
    prompt: `${ctx}

Implement the change in this Deno repo. Match the existing code patterns and conventions.
Run \`deno task test\` and make it pass. Leave your changes in the working tree — do NOT
run git commit; the workflow commits and pushes for you.
When done, output <promise>COMPLETE</promise>.`,
  });
  setOutput('mode=implement');

  // Commit whatever the agent changed (identity supplied inline so no global
  // git config is required on the runner), then publish on a dedicated branch.
  if (sh('git status --porcelain')) {
    execSync('git add -A', { stdio: 'inherit' });
    execSync(
      'git -c user.email="agent@hotsauce.local" -c user.name="Hotsauce Agent" ' +
        `commit -m "Agent: implement #${issue}"`,
      { stdio: 'inherit' },
    );
  }
  if (sh('git rev-parse HEAD') !== baseSha) {
    const branch = `agent/issue-${issue}`;
    // Push with the checkout-persisted GITHUB_TOKEN (contents: write).
    execSync(`git push origin HEAD:refs/heads/${branch}`, { stdio: 'inherit' });
    setOutput(`branch=${branch}`);
  } else {
    process.stdout.write(
      'Agent produced no changes; skipping branch push and PR.\n',
    );
  }
}
