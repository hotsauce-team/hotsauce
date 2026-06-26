Emit a single `<output>` block as the last thing in your response.

Do not change files. Do not run commands. Do not include text outside the
`<output>` block.

```json
<output>
{
  "replies": [
    {
      "comment_id": 123456789,
      "body": "Fixed in this round: <what changed>. (Or: dismissed because <why>.)"
    }
  ]
}
</output>
```

Rules:

- `replies` may be an empty array (`[]`) if there was nothing to respond to.
- Each `comment_id` must be the `id` of one of the review comments you were
  given. `body` is non-empty markdown — a short reply for that thread.
- Include one reply per comment you fixed or dismissed.
