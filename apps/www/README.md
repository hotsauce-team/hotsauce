# hotsauce-cms Marketing Site

Minimal marketing site for hotsaucecms.com. Dogfoods hotsauce-cms with markdown content.

## Stack

- **Server**: Deno's native `fetch` handler (no framework)
- **Database**: PGlite (embedded Postgres)
- **Rendering**: micromark for markdown
- **Styling**: Inline CSS (~80 lines)

Zero framework dependencies.

## Development

```bash
cd apps/www

# Seed initial content
deno task seed

# Start dev server (port 3010)
deno task dev
```

## Adding Content

Edit `seed/seed.ts` to add or modify pages, then re-run `deno task seed`.

Future: Add hotsauce-cms admin at `/admin` for content editing.
