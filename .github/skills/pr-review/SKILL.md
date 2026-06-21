---
name: pr-review
description: 'Process PR review comments. Use when: reviewing feedback, validating comments, addressing PR reviews, fixing PR issues, responding to code review. Validates each comment, fixes obvious issues, asks for clarification on unclear feedback, and reports invalid suggestions.'
argument-hint: 'Optionally provide a PR URL or number, otherwise uses current branch'
---

# PR Review Processing

Process all review comments on a pull request: validate feedback, fix obvious issues, clarify ambiguous suggestions, and dismiss invalid comments with reasoning.

## When to Use

- After receiving PR review feedback
- When asked to "address PR comments" or "fix review feedback"
- When processing code review suggestions
- When validating reviewer feedback

## Procedure

### 1. Identify the PR

If no PR URL/number provided:

```bash
gh pr view --json number,url,headRefName
```

Or fetch from the current branch's associated PR.

### 2. Fetch Review Comments

Get all review comments:

```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments
```

Or use `fetch_webpage` on the PR discussion URL for context.

### 3. Process Each Comment

For each review comment, follow this decision tree:

#### A. Validate the Feedback

1. Read the code being reviewed
2. Understand what the reviewer is suggesting
3. Determine if the feedback is:
   - **Valid + Obvious Fix**: The issue is real and the solution is clear
   - **Valid + Needs Clarification**: The issue is real but the fix isn't obvious
   - **Invalid**: The feedback is incorrect or already addressed

#### B. Take Action

**If Valid + Obvious Fix:**

1. Implement the fix
2. Add tests if applicable
3. Run existing tests to verify
4. Commit with message referencing the feedback
5. Report: "Fixed: [summary]"

**If Valid + Needs Clarification:**

1. Identify specifically what's unclear
2. Ask the user targeted questions:
   - What's the expected behavior?
   - Which approach do you prefer?
   - Any constraints to consider?
3. Wait for user response before proceeding

**If Invalid:**

1. Explain why the feedback doesn't apply
2. Provide evidence (code snippets, test results)
3. Draft a polite dismissal response for user approval:
   ```
   Suggested reply: "Thanks for the review! [Explanation of why this doesn't apply]. [Evidence]"
   ```
4. Do NOT auto-post—let user decide whether to reply

### 4. Summary Report

After processing all comments, provide:

- ✅ Fixed: [count] issues
- ❓ Need clarification: [count] items (with questions)
- ❌ Invalid: [count] suggestions (with dismissal drafts)

## Commit Convention

When fixing PR feedback:

```
fix: [brief description]

Addresses review comment: [link or quote]
```

## Replying to Review Comments

To reply to a specific review comment, use the GitHub API with `in_reply_to`:

```bash
# First, get comment IDs
GH_PAGER=cat gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '.[] | "\(.id): \(.body[:60])..."'

# Reply to a specific comment
GH_PAGER=cat gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -X POST \
  -f body="Your reply message" \
  -F in_reply_to={comment_id}
```

**Important:**

- Use `GH_PAGER=cat` to prevent the pager from opening
- Pipe to `| cat` as fallback if output still opens a pager
- `in_reply_to` links the reply to the specific review thread
- Do NOT use `gh pr comment`—that creates top-level PR comments, not review replies

## Reply Convention (for user to post)

When dismissing invalid feedback, draft replies that are:

- Polite and professional
- Include specific evidence
- Reference line numbers or code when helpful

Example:

```
Thanks for catching this! Actually, this was already addressed in commit abc123 where we added the hidden column check. The test at line 456 verifies this behavior.
```

## Notes

- Always run tests after making fixes
- Group related fixes into single commits when logical
- For complex feedback, it's okay to ask the user for guidance
- Never auto-reply to GitHub—always get user approval first
