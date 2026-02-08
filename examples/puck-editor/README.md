# Puck Editor Example

Demonstrates the hotsauce-cms plugin system by adding "Edit with Puck" links to JSON columns.

## What This Shows

The Puck editor plugin detects columns marked with `.$cms({ plugins: { puck: true } })` and adds an edit link in the CMS form:

```typescript
// In schema.ts
export const pages = pgTable('pages', {
  // ...
  content: jsonb('content').$cms({ plugins: { puck: true } }),
});
```

When editing a page in the CMS, the `content` field will show an "Edit with Puck" link that opens the visual editor.

## Plugin Implementation

The plugin is simple - it just checks `ctx.field.plugin` which the CMS automatically populates:

```typescript
function createPuckPlugin(basePath: string): InProcessPluginConfig {
  return {
    name: 'puck',
    hooks: {
      ui: {
        renderField: (ctx) => {
          if (ctx.field.plugin && ctx.recordId) {
            return {
              link: {
                href:
                  `${basePath}/puck/${ctx.table}/${ctx.recordId}/${ctx.field.name}`,
                label: 'Edit with Puck',
              },
            };
          }
          return null;
        },
      },
    },
    filter: (ctx) =>
      ctx.hookType === 'ui:renderField' || ctx.hookType === 'route',
  };
}
```

## Quick Start

1. **Seed the database:**

```bash
deno task seed
```

2. **Run the server:**

```bash
deno task dev
```

3. **Open the CMS:** http://localhost:3000/admin

4. **Edit a page** - you'll see the "Edit with Puck" link on the content field

## Current Status

This example loads Puck directly from esm.sh without a bundler, demonstrating bundler-free React usage.

**Known Limitations:**

- Drag-and-drop operations may fail due to dnd-kit module loading issues with esm.sh
- Component editing via the sidebar works fine
- For production use, bundle Puck with Vite/esbuild/etc.

The Save button returns 501 (not implemented) - POST route support is planned for a future release.

## Project Structure

```
examples/puck-editor/
├── server.ts       # Entry point with Hono
├── db.ts           # Database connection
├── schema.ts       # Drizzle schema with Puck plugin config
├── seed.ts         # Database seeding
├── admin/
│   └── admin.ts    # CMS handler + Puck plugin
└── data/           # PGlite database (created on seed)
```

## Next Steps (Future)

- Add React + Puck editor at `/admin/puck/:table/:id/:field`
- Load/save JSON content via API endpoints
- Add custom Puck components
