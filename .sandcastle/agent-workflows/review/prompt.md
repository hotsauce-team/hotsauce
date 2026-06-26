# TASK

You are reviewing the code on PR #{{PR_NUMBER}} (branch `{{BRANCH}}`), a change
implemented by an automated agent. Review it the way a careful human reviewer
would: focus on real problems, not style nits a formatter already handles.

# CONTEXT

Read the project's conventions before judging the code:

- `AGENTS.md` (repo conventions for agents — note the ⛔ CRITICAL RULES)
- package-level `README.md` files where relevant

Explore the surrounding code and tests so your comments are grounded in how the
codebase actually works.

# DIFF UNDER REVIEW

```diff
{{DIFF}}
```

# WHAT TO LOOK FOR

In priority order:

1. **Correctness bugs** — logic errors, wrong edge-case handling, broken
   invariants, missing `await`, incorrect types, security/permission mistakes.
2. **Convention violations** — anything that breaks the rules in `AGENTS.md`
   (e.g. `Deno.*`/Node APIs in packages, unapproved dependencies, `--allow-*`
   flags, `npm`/`yarn`/`pnpm` usage).
3. **Clear reuse / simplification** — duplicated logic that an existing helper
   already covers, or needless complexity with an obviously simpler form.

Only raise something you are confident about and can tie to a specific line.
Prefer fewer, high-signal comments. If the change looks correct, it is fine to
return no inline comments.

# CONSTRAINTS

This is a **read-only** review. Do **not** edit files, run tests, commit, push,
create or edit PRs, or call the GitHub API. Just read and analyse.

When complete, output `<promise>COMPLETE</promise>`.
