# Puck Plugin TODO

## Current Status

- ✅ Basic Puck editor renders at `/admin/puck/:table/:id/:column`
- ✅ Bundle embedded (882KB JS, 72KB CSS) via `deno task build:puck`
- ✅ Watch mode: `deno task build:puck:watch`
- ✅ One demo component: `HeadingBlock`
- ✅ Data loads from database column
- ✅ Saving works (POSTs form data to CMS update endpoint)
- ✅ **Source tokens + plugin-aware policies** — Secure plugin write access

## Remaining Tasks

### High Priority

- [x] **CMS edit screen → Puck editor navigation**
  - Plugin columns show as read-only with "Edit with Puck" button
  - `valueSummary` displays block count instead of raw JSON
  - Implemented via `renderField` UI hook in plugin config

- [ ] **Add more components** — Currently only `HeadingBlock`
  - Text/Paragraph
  - Image
  - Button
  - Container/Columns
  - See Puck docs: https://puckeditor.com/docs/components

### Medium Priority

- [ ] **Custom component config via plugin options**
  - Allow users to pass their own `config.components` when calling `createPuckPlugin()`
  - Merge with defaults or replace entirely

- [ ] **User-provided React component library**
  - Users should be able to bring their own React components (buttons, cards, heroes, etc.)
  - These components are used both in Puck editor AND on the frontend
  - Need a way to register components that works for both contexts:
    - Editor: needs field definitions + render functions
    - Frontend: just needs render functions
  - Consider: component library as separate bundle? Or inline in user's app?

- [ ] **Load saved data into editor**
  - Currently hardcoded to empty canvas in client
  - Should use `bootstrap.data` from server

- [ ] **Preview/Render mode**
  - Add route for rendering saved Puck content (read-only)
  - Use `<Render config={config} data={data} />` from @puckeditor/core
  - **SSR potential**: Puck's `<Render>` is good for server-side rendering
    - User's frontend can import same component library
    - Render Puck JSON to HTML on server (Deno, Node, etc.)
    - No client-side React needed for read-only pages
    - Great for SEO, performance, static site generation

### Low Priority

- [ ] **Undo/redo persistence** — Puck has built-in history
- [ ] **Autosave** — Save draft on changes
- [ ] **Version history** — Track content revisions
- [ ] **Collaborative editing** — Multiple users (needs backend)

## Files

- `packages/plugins/puck/mod.ts` — Plugin entry, routes, HTML template
- `packages/plugins/puck/client/main.tsx` — React client (bundled)
- `packages/plugins/puck/build.ts` — Bundle script using `Deno.bundle()`
- `packages/plugins/puck/bundle-embedded.ts` — Auto-generated JS bundle
- `packages/plugins/puck/css-embedded.ts` — Auto-generated CSS
- `examples/puck-editor/` — Demo app

## Commands

```bash
deno task build:puck        # Build bundle once
deno task build:puck:watch  # Watch and rebuild
deno task puck:dev          # Run example server
deno task puck:seed         # Seed example database
```
