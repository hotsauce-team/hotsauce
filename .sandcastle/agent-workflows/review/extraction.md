Emit a single `<output>` block as the last thing in your response.

Do not change files. Do not run commands. Do not include text outside the
`<output>` block.

```json
<output>
{
  "summary": "A short markdown overview of the review (what you checked, overall verdict). Required, non-empty.",
  "comments": [
    {
      "path": "packages/core/src/example.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "The inline review comment for this line."
    }
  ]
}
</output>
```

Rules:

- `summary` is required and must be non-empty markdown.
- `comments` may be an empty array (`[]`) if you found nothing worth flagging.
- Each comment's `path` must be a file changed in the diff, and `line` must be a
  line that appears in the diff for that file. Use `"side": "RIGHT"` for added /
  unchanged lines (the new version) and `"side": "LEFT"` for removed lines.
- `line` is a number; `body` is non-empty markdown.
