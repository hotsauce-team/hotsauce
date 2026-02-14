# Puck Plugin TODO

## Current Status

- ✅ Basic Puck editor renders at `/admin/puck/:table/:id/:column`
- ✅ **Version-agnostic** — users provide their own Puck bundle and CSS
- ✅ Data loads from database column via bootstrap JSON
- ✅ Saving works (POSTs form data to CMS update endpoint)
- ✅ **Source tokens + plugin-aware policies** — Secure plugin write access
- ✅ "Edit with Puck" button in CMS edit screens
- ✅ `valueSummary` displays block count instead of raw JSON

## Remaining Tasks

### Medium Priority

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
- `apps/demo/` — Demo app with user-built Puck bundle
- `apps/demo/components.tsx` — Example user-defined Puck components
- `apps/demo/admin/admin.ts` — CMS handler with Puck plugin

## Commands

```bash
deno task demo:build:components  # Build Puck components bundle
deno task demo:dev               # Run demo server
deno task demo:seed              # Seed demo database
```
