// Sandcastle orchestration for the "Agent on Issue" workflow.
//
// Driven by the MODE env var set in .github/workflows/agent-on-issue.yml:
//   explore   -> read-only research; writes triage notes to .sandcastle/triage-notes.md
//   implement -> implements the change on a branch and pushes it
//
// Verified against @ai-hero/sandcastle@0.10.0:
//   noSandbox()                         -> sandboxes/no-sandbox export
//   claudeCode(model, { effort, permissionMode })
//   run(...) -> RunResult { commits: { sha }[]; branch: string }
//   branchStrategy: { type: "head" } | { type: "branch", branch }
import { claudeCode, run } from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const mode = process.env.MODE === 'explore' ? 'explore' : 'implement';
const issue = process.env.ISSUE_NUMBER;
if (!issue) throw new Error('ISSUE_NUMBER env var is required');

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
  // Read-only research. `permissionMode: "plan"` keeps the agent out of edit
  // mode; we also never push or open a PR here, so any stray writes are
  // discarded with the ephemeral runner.
  await run({
    agent: claudeCode('claude-opus-4-8', {
      effort: 'high',
      permissionMode: 'plan',
    }),
    sandbox: noSandbox(),
    branchStrategy: { type: 'head' },
    prompt: `${ctx}

Research this issue in the repo WITHOUT changing any source files. Investigate the
root cause, the affected files, and a recommended implementation approach. Write your
findings as markdown to \`.sandcastle/triage-notes.md\` (create the file).
When done, output <promise>COMPLETE</promise>.`,
  });
  setOutput('mode=explore');
} else {
  const branch = `agent/issue-${issue}`;
  const result = await run({
    agent: claudeCode('claude-opus-4-8', { effort: 'high' }),
    sandbox: noSandbox(),
    branchStrategy: { type: 'branch', branch },
    prompt: `${ctx}

Implement the change in this Deno repo. Match the existing code patterns and conventions.
Run \`deno task test\` and make it pass before finishing.
When done, output <promise>COMPLETE</promise>.`,
  });
  setOutput('mode=implement');
  if (result.commits.length > 0) {
    // Push using the checkout-persisted GITHUB_TOKEN (contents: write).
    execSync(`git push origin ${result.branch}`, { stdio: 'inherit' });
    setOutput(`branch=${result.branch}`);
  } else {
    process.stdout.write(
      'Agent produced no commits; skipping branch push and PR.\n',
    );
  }
}
