# Agent on Issue

A label-driven state machine that runs a Claude Code agent on GitHub issues via
[sandcastle](https://github.com/mattpocock/sandcastle) (`@ai-hero/sandcastle`).
The layout mirrors sandcastle's own `agent-workflows/` examples.

Workflow:
[`.github/workflows/agent-on-issue.yml`](../.github/workflows/agent-on-issue.yml)

```
.sandcastle/
├── package.json                 # pins @ai-hero/sandcastle + tsx (run with npx tsx)
└── agent-workflows/
    ├── shared/                  # helpers shared by every workflow
    │   ├── common.ts            # required/fail/sh/gh/writeText/claudeAgent, OUTPUT_DIR
    │   └── run-with-extraction.ts
    ├── explore/                 # agent:explore — read-only triage
    │   ├── explore.ts
    │   ├── prompt.md            # produce pass
    │   └── extraction.md        # structured <output> pass
    └── implement/               # agent:implement — implement on a branch
        ├── implement.ts
        └── prompt.md
```

## State machine

| Add this label    | Agent does                                           | On success                                        | On failure                                       |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `agent:explore`   | Researches the issue read-only, emits triage notes   | −`in-progress`, +`agent:explored`, comments notes | −`in-progress`, +`agent:blocked`, comments error |
| `agent:implement` | Implements on `agent/issue-<n>`, the workflow PRs it | −`in-progress`, +`agent:done`, comments PR link   | −`in-progress`, +`agent:blocked`, comments error |

Both add `agent:in-progress` on start. Typical flow: label `agent:explore`,
review the triage comment, then label `agent:implement`.

## How it works (matches the sandcastle examples)

- **`noSandbox()`** — the ephemeral GitHub Actions runner is the sandbox. No
  `permissionMode` is set; headless `claude -p` edits/commits without prompts.
- **Separation of duties** — the agent only researches (explore) or edits +
  commits on a pre-created branch (implement). It never pushes, opens PRs, or
  edits labels. The **workflow** pushes, opens the PR, requests Copilot, and
  drives labels.
- **Explore uses structured output** — the agent emits an `<output>{comment}`
  block (`run-with-extraction.ts`); the script writes it to
  `OUTPUT_DIR/comment.md` and the workflow posts it.
- **Branch push uses `GITHUB_TOKEN`; PR creation uses `PR_CREATE_TOKEN`** (a
  fine-grained PAT, Pull requests: write) so `test.yml` runs on the agent's PR —
  the built-in token can't trigger downstream workflows.

## One-time setup

1. **Labels** (exact strings): `agent:explore`, `agent:implement`,
   `agent:in-progress`, `agent:explored`, `agent:done`, `agent:blocked`.
2. **Secret `CLAUDE_CODE_OAUTH_TOKEN`** — from `claude setup-token`.
3. **Secret `PR_CREATE_TOKEN`** — fine-grained PAT, this repo, Pull requests:
   write.
4. **Enable Copilot code review** for the repo/org (else that step soft-fails).

## Local dry-run

```bash
cd .sandcastle && npm install
export ISSUE_NUMBER=123
export ISSUE_TITLE="Example"
export CLAUDE_CODE_OAUTH_TOKEN=...        # from `claude setup-token`
export OUTPUT_DIR="$PWD/output"

# explore -> writes output/comment.md, no commits
npx tsx agent-workflows/explore/explore.ts

# implement -> needs a branch checked out first; commits onto it
export BRANCH=agent/issue-123
git switch -c "$BRANCH"
npx tsx agent-workflows/implement/implement.ts
```
