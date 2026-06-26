# Agent on Issue

A label-driven state machine that runs a Claude Code agent on GitHub issues via
[sandcastle](https://github.com/mattpocock/sandcastle) (`@ai-hero/sandcastle`).
The layout mirrors sandcastle's own `agent-workflows/` examples.

Workflows (one per action, mirroring sandcastle's `.github/workflows/`):
[`agent-explore.yml`](../.github/workflows/agent-explore.yml) ·
[`agent-implement.yml`](../.github/workflows/agent-implement.yml)

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
    ├── implement/               # agent:implement — implement on a branch
    │   ├── implement.ts
    │   └── prompt.md
    ├── review/                  # review round — read-only Claude reviewer
    │   ├── review.ts            # emits review.json (inline comments)
    │   ├── prompt.md
    │   └── extraction.md
    └── address-review/          # review round — fix Copilot + Claude comments
        ├── address-review.ts    # fixes + commits, emits replies.json
        ├── prompt.md
        └── extraction.md
```

## State machine

| Add this label    | Agent does                                           | On success                                        | On failure                                       |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `agent:explore`   | Researches the issue read-only, emits triage notes   | −`in-progress`, +`agent:explored`, comments notes | −`in-progress`, +`agent:blocked`, comments error |
| `agent:implement` | Implements on `agent/issue-<n>`, the workflow PRs it, then runs one **review round** (Copilot + a Claude reviewer) and addresses the comments | −`in-progress`, +`agent:done`, comments PR link   | −`in-progress`, +`agent:blocked`, comments error |

Both add `agent:in-progress` on start. Typical flow: label `agent:explore`,
review the triage comment, then label `agent:implement`.

## How it works (matches the sandcastle examples)

- **`noSandbox()`** — the ephemeral GitHub Actions runner is the sandbox. No
  `permissionMode` is set; headless `claude -p` edits/commits without prompts.
- **Separation of duties** — the agents only research (explore), edit + commit
  on a pre-created branch (implement, address-review), or read + report (review).
  They never push, open PRs, edit labels, or call the GitHub API. The **workflow**
  pushes, opens the PR, requests Copilot, posts the Claude review and the review
  replies, and drives labels.
- **Structured output everywhere** — agents emit an `<output>` block
  (`run-with-extraction.ts`) the workflow consumes: explore → `comment.md`;
  review → `review.json` (inline comments); address-review → `replies.json`
  (threaded replies). The workflow posts all of it.
- **Review round (one pass)** — after the PR opens, the workflow requests Copilot
  (async) and posts the `review/` agent's findings as inline comments, so both
  reviews land together. It polls (bounded, ~10 min; a timeout is a warning) for
  Copilot, then runs `address-review/` over **all** comments. If the post-fix
  `deno task test` fails the issue goes `agent:blocked`; otherwise fixes are
  re-pushed and replies posted before `agent:done`.
- **Branch push uses `GITHUB_TOKEN`; PR creation and the re-push of review fixes
  use `PR_CREATE_TOKEN`** (a fine-grained PAT, Pull requests: write) so `test.yml`
  runs on the agent's PR — the built-in token can't trigger downstream workflows.

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

# review -> read-only; needs a branch with a diff vs main. Writes output/review.json
export PR_NUMBER=456
npx tsx agent-workflows/review/review.ts

# address-review -> fetches the PR's review comments, fixes + commits.
# Writes output/replies.json. Needs GH_REPO=owner/repo and a real PR with comments.
export GH_REPO=owner/repo
npx tsx agent-workflows/address-review/address-review.ts
```
