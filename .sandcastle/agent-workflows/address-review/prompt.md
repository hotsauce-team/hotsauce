# TASK

Address the code-review comments on PR #{{PR_NUMBER}}. You are on branch
`{{BRANCH}}`, already checked out. The comments come from two reviewers (GitHub
Copilot and a Claude reviewer); treat them the same way.

This runs **headless in CI** — there is no human to ask. Do the work in **one
round**: make your best judgement on each comment, fix what should be fixed, and
justify what you dismiss. Do not wait for approval and do not re-review your own
output.

# REVIEW COMMENTS

Each entry has an `id` (use it as `comment_id` when you reply), `path`, `line`,
`author`, `body`, and the `diff_hunk` it was left on.

```json
{{COMMENTS}}
```

# CONTEXT

Read the project's conventions before changing code:

- `AGENTS.md` (repo conventions — note the ⛔ CRITICAL RULES)
- package-level `README.md` files where relevant

Explore the surrounding code and tests before editing.

# PROCEDURE

For each comment, decide:

- **Valid + fixable** — implement the fix. Where a test seam already exists, do
  red-green-refactor (write a failing test, make the smallest correct change).
  Do not improvise new test seams just to test in isolation.
- **Invalid / already handled** — do not change code; instead plan a short,
  polite reply explaining why, with evidence (a line reference or test name).

When several comments touch the same area, group related fixes into one commit.

Run `deno task test` before committing, and make it pass.

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional commit messages (e.g.
`fix: …`) that reference the feedback. If every comment was invalid, it is fine
to make no commits.

Do **not** push the branch. Do **not** close the issue. Do **not** edit labels.
Do **not** create or edit PRs. Do **not** post comments or replies via the
GitHub API — the workflow posts your replies for you (see the output step).

# REPLIES

For each comment you acted on or dismissed, produce a reply keyed by its
`comment_id`, stating what you changed or why it does not apply. The workflow
posts these to the review threads.

When complete, output `<promise>COMPLETE</promise>`.
