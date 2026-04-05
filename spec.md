# Media Grid View — Spec

## Summary

Add a `thumbnail: true` column option that enables a grid view for tables with visual content. Tables with a thumbnail column default to grid view with a toggle to switch to table view. The grid shows image thumbnails in a CSS grid with an RHS detail panel for metadata.

## Schema API

```typescript
// Column marked as thumbnail → table defaults to grid view
file: jsonb('file').$type<FileReference>().$cms({
  file: { accept: 'image/*' },
  thumbnail: true,
});

// Also works on plain URL columns
avatarUrl: varchar('avatar_url').$cms({ thumbnail: true });
```

## Checklist

### 1. Core: `thumbnail` column option

- [x] Add `thumbnail?: boolean` to `CmsColumnOptions` in `packages/core/extend/types.ts`
- [x] Surface `thumbnail` in `CMSField` interface in `packages/core/fields/mapping.ts`
- [x] Propagate `thumbnail` in `mapColumnToField()`
- [x] Export any new types from `packages/core/mod.ts` if needed

### 2. Core: Detect thumbnail column from introspected table

- [x] Add `getThumbnailField()` helper to `packages/core/fields/mapping.ts` — scans fields for `thumbnail: true`, returns the field or `undefined`

### 3. UI: Grid view component

- [x] Create `packages/ui/views/grid.ts` with `gridView()` function
- [x] Grid renders thumbnail images in a CSS grid layout
- [x] Each grid item is a link to the record's detail/edit page
- [x] Grid items show filename/alt text below thumbnail
- [x] Empty state matches existing table empty state
- [x] Handle missing thumbnails gracefully (placeholder)
- [x] Resolve thumbnail URL from `FileReference` (fileUrl → url → data) or plain string

### 4. UI: View toggle component

- [x] Add `viewToggle()` function (grid/table toggle buttons)
- [x] Toggle uses `?view=grid` / `?view=table` URL params
- [x] Preserves existing query params (sort, page)
- [x] Active state styling for current view

### 5. UI: Grid CSS

- [x] Add grid view styles to `packages/ui/styles.ts`
- [x] Responsive grid: `repeat(auto-fill, minmax(180px, 1fr))`
- [x] Thumbnail aspect ratio (square crop via `object-fit: cover`)
- [x] Selected/hover state
- [x] View toggle button styles

### 6. UI: Exports

- [x] Export `gridView`, `GridViewOptions` from `packages/ui/views/grid.ts`
- [x] Export `viewToggle` from grid or a shared component
- [x] Re-export from `packages/ui/mod.ts`

### 7. CMS: Route handling for grid view

- [x] In `handleList` (`packages/cms/crud.ts`): detect thumbnail column on table
- [x] Parse `?view=grid|table` from URL (default to `grid` when thumbnail exists)
- [x] When grid view: pass thumbnail column info + file URLs to `gridView()`
- [x] When table view: existing `listView()` as today
- [x] Render view toggle in both modes when thumbnail column exists

### 8. CMS: File URL resolution for grid thumbnails

- [x] In `handleList`, resolve signed URLs for thumbnail column via plugin's `signDownloadUrl` (if storage plugin configured)
- [x] For inline (base64) files, use data: URI
- [x] For plain URL columns, use the string value directly

### 9. Demo: Update schema

- [x] Add `thumbnail: true` to media table's file column in `apps/demo/schema.ts`

### 10. Tests

- [x] Test `thumbnail` option is preserved through column introspection
- [x] Test `getThumbnailField()` returns correct field / undefined
- [x] Test `gridView()` renders expected HTML structure
- [x] Test `viewToggle()` renders with correct active state
- [x] Test `handleList` defaults to grid when thumbnail column present
- [x] Test `handleList` respects `?view=table` override

## Out of scope (for now)

- Search/filter on the grid
- Picker mode (`?_picker=true`)
- Puck integration
- Thumbnail in table list view rows

---

## RHS Detail Panel

### Summary

When a grid item is clicked, instead of navigating to the detail/edit page, the grid view shows a right-hand side panel with a larger thumbnail preview, file metadata, and all editable fields inline. The panel uses `?selected=<id>` as a URL parameter — the server re-renders the page with the panel populated. Forms use standard POST to the existing update endpoint, with a `_return` hidden field to redirect back to the grid.

### Checklist

#### 11. UI: Grid detail panel component

- [x] Add `gridDetailPanel()` function to `packages/ui/views/grid.ts`
- [x] Panel renders: larger thumbnail preview at top
- [x] Panel renders: file metadata (filename, size, content type) for file fields
- [x] Panel renders: edit form with all writable fields (reusing `form()` from forms/form.ts)
- [x] Panel renders: delete button
- [x] Panel includes hidden `_return` field pointing back to grid URL
- [x] Panel form `action` targets `/{table}/{id}` (existing update endpoint)
- [x] Panel form includes CSRF + source tokens
- [x] Panel supports multipart encoding when file columns exist

#### 12. UI: Grid item links update

- [x] Grid items link to `?selected=<id>` instead of `/{table}/{id}`
- [x] Selected grid item has visual highlight (`.cms-grid-item-selected`)
- [x] Preserve existing query params (page, sort) in selected links

#### 13. UI: Panel CSS

- [x] Grid + panel side-by-side layout (`.cms-grid-panel-layout`)
- [x] Panel fixed width (~380px) on right, grid fills remaining space
- [x] Panel scrollable independent of grid
- [x] Larger thumbnail in panel (`object-fit: contain` so full image is visible)
- [x] File metadata styling
- [x] Close button / deselect (link back to grid without `?selected`)
- [x] Responsive: panel stacks below grid on narrow screens

#### 14. CMS: handleList panel data preparation

- [x] Detect `?selected=<id>` URL param in `handleList`
- [x] Fetch selected record (with row/column policy applied)
- [x] Prepare CMS fields filtered by writableColumns
- [x] Fetch relation data for FK dropdowns
- [x] Generate CSRF + source tokens for panel form
- [x] Resolve presigned file URL for panel thumbnail
- [x] Compute field overrides from plugins
- [x] Pass all data to `gridDetailPanel()`

#### 15. CMS: Update/delete redirect from panel

- [x] In `handleUpdate`: check for `_return` form field
- [x] Validate `_return` is a relative URL under basePath (prevent open redirect)
- [x] Redirect to `_return` on success instead of detail page
- [x] In `handleDelete`: check for `_return` form field with same validation
- [x] Redirect to `_return` on success instead of list page

#### 16. Tests

- [x] Test `gridDetailPanel()` renders thumbnail, metadata, form fields
- [x] Test grid items link to `?selected=<id>` when panel mode active
- [x] Test `handleList` with `?selected=<id>` returns panel HTML
- [x] Test `handleUpdate` redirects to `_return` when present
- [x] Test `_return` validation rejects absolute URLs / other origins
