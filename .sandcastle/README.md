# Agent on Issue

A label-driven state machine that runs a Claude Code agent on GitHub issues via
[sandcastle](https://github.com/mattpocock/sandcastle) (`@ai-hero/sandcastle`).

Workflow: [`.github/workflows/agent-on-issue.yml`](../.github/workflows/agent-on-issue.yml)
Orchestration: [`run-issue.ts`](./run-issue.ts)

## State machine

| Add this label    | Agent does                                                       | On start                                 | On success                                        | On failure                                       |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `agent:explore`   | Researches the issue read-only, writes triage notes              | −`agent:explore`, +`agent:in-progress`   | −`in-progress`, +`agent:explored`, comments notes | −`in-progress`, +`agent:blocked`, comments error |
| `agent:implement` | Implements, pushes a branch, opens a PR, requests Copilot review | −`agent:implement`, +`agent:in-progress` | −`in-progress`, +`agent:done`, comments PR link   | −`in-progress`, +`agent:blocked`, comments error |

Typical flow: label `agent:explore`, review the triage comment, then label
`agent:implement` to ship a PR.

## One-time setup

1. **Labels** (exact strings): `agent:explore`, `agent:implement`, `agent:in-progress`,
   `agent:explored`, `agent:done`, `agent:blocked`.
2. **Secret `CLAUDE_CODE_OAUTH_TOKEN`** — from `claude setup-token`.
3. **Secret `PR_CREATE_TOKEN`** — fine-grained PAT scoped to this repo with
   **Pull requests: write** (Metadata: read is added automatically). Opening the PR with a
   PAT rather than the built-in `GITHUB_TOKEN` is what lets `test.yml` run on the agent's PR.
   The token owner needs write access to the repo.
4. **Enable Copilot code review** for the repo/org. If it isn't enabled, the review-request
   step soft-fails with a warning instead of failing the run.

## Why these choices

- **`no-sandbox`**: the GitHub Actions runner is already an ephemeral, disposable VM, so the
  agent runs directly on it — no Dockerfile to build or maintain.
- **Branch push uses `GITHUB_TOKEN`; PR creation uses the PAT**: pushing a branch is a
  Contents-write the runner token already has, and pushing a feature branch doesn't trigger
  `test.yml`. Opening the PR with the PAT is what fires `test.yml` (GitHub suppresses workflow
  triggers from the built-in token).

## Local dry-run

```bash
export MODE=explore                 # or: implement
export ISSUE_NUMBER=123
export ISSUE_TITLE="Example"
export ISSUE_BODY="Describe the task"
export CLAUDE_CODE_OAUTH_TOKEN=...   # from `claude setup-token`
npm install --no-save @ai-hero/sandcastle tsx
npx tsx .sandcastle/run-issue.ts
```

`explore` produces `.sandcastle/triage-notes.md` and no commits. `implement` creates the
`agent/issue-<n>` branch with commits (the `git push` only runs when `GITHUB_OUTPUT` is set,
i.e. inside Actions).
