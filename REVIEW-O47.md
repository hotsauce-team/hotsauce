# Peer Review — `puck-image-picker` branch

Compared against `main`: 12 commits, +1586 / −174 across 24 files.

This branch introduces an **iframe-embedded image picker** for the Puck plugin:

- A new picker rendering mode on the CMS grid view
- A signed `_source` token gate on picker requests
- A `role: 'source'` opt-in for column-level data exposure to plugins
- A new `ImagePickerField` React component
- Replacement of inline pre-signed thumbnail URLs with proxy URLs through `/admin/files/...`

The design is well thought out and the security model is sound at the primitives level (HMAC-signed token, timing-safe verification, postMessage origin + source validation, secure-by-default opt-in). The issues below focus on what's left: a couple of plumbing inconsistencies between handlers, a performance regression, several UX/correctness bugs, and a few harden-this items before merge.

---

## 1. High-level summary of changes

| Area                                                                                                                                  | Change                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [packages/cms/crud.ts](packages/cms/crud.ts)                                                                                          | Picker branch in `handleList`; source-token validation; per-plugin column filtering; switched grid thumbnails from inline signed URLs to `/admin/files/...` proxy URLs |
| [packages/cms/grid-helpers.ts](packages/cms/grid-helpers.ts)                                                                          | Removed `signThumbnailUrl`; panel preview also uses proxy URL                                                                                                          |
| [packages/cms/mod.ts](packages/cms/mod.ts)                                                                                            | Wired `picker.js` route; `/admin/files/...` route now accepts an optional trailing filename segment                                                                    |
| [packages/cms/scripts.ts](packages/cms/scripts.ts)                                                                                    | New `handlePickerScript`                                                                                                                                               |
| [packages/cms/tests/integration_picker_test.ts](packages/cms/tests/integration_picker_test.ts)                                        | 593-line test suite covering opt-in, plugin isolation, and token rejection                                                                                             |
| [packages/ui/views/grid.ts](packages/ui/views/grid.ts)                                                                                | `pickerMode`/`tableName` options on `GridViewOptions`; new `pickerGridView`, `pickerLayout`, `pickerScript`                                                            |
| [packages/ui/styles.ts](packages/ui/styles.ts)                                                                                        | `.cms-picker-*` styles                                                                                                                                                 |
| [packages/plugins/puck/fields/ImagePickerField.tsx](packages/plugins/puck/fields/ImagePickerField.tsx)                                | New custom Puck field; opens picker in `<dialog>` iframe and listens for `cms:media-selected`                                                                          |
| [packages/plugins/puck/client/main.tsx](packages/plugins/puck/client/main.tsx), [globals.ts](packages/plugins/puck/client/globals.ts) | Expose `globalThis.CmsContext = { basePath, sourceToken }` to user component bundles                                                                                   |
| [packages/plugins/puck/bundle-embedded.ts](packages/plugins/puck/bundle-embedded.ts)                                                  | Re-bundled (+95 bytes)                                                                                                                                                 |
| [apps/demo/components.tsx](apps/demo/components.tsx), [schema.ts](apps/demo/schema.ts)                                                | Demo `Image` component now uses the picker; `media.file`/`alt` opt in via `plugins: { puck: { role: 'source' } }`                                                      |
| [apps/demo/site/routes.ts](apps/demo/site/routes.ts)                                                                                  | Public `/files/media/:id/:filename?` accepts optional filename for SEO                                                                                                 |

---

## 2. Strengths

- **Secure-by-default opt-in.** Picker payloads contain only the PK plus columns explicitly opted in via `$cms({ plugins: { <name>: { role: 'source' } } })`. `thumbnail: true` never leaks file data into picker output. Well tested ([crud.ts](packages/cms/crud.ts#L632-L658), [tests](packages/cms/tests/integration_picker_test.ts#L240-L362)).
- **Signed source-token gate.** `handleList` rejects `?picker=true` requests without a valid `_source` token (`403`). HMAC-signed, timestamp-included, timing-safe verify ([packages/cms/tokens/source.ts](packages/cms/tokens/source.ts#L114-L149)). Plugin name is read from the _signed_ token, so URL tampering can't pick which plugin's source columns to receive.
- **Plumbing of `source` to row policies.** `handleList`'s `policyCtx` now carries the validated `source` ([crud.ts L491](packages/cms/crud.ts#L491)), enabling `ctx.source === 'plugin:puck'` rules.
- **postMessage validation in the field.** [`ImagePickerField`](packages/plugins/puck/fields/ImagePickerField.tsx#L131-L149) validates both `event.source === iframeRef.current?.contentWindow` and `event.origin === expectedOrigin`, and **fails closed** if the trusted origin can't be derived.
- **Iframe framing controls.** Picker responses set `X-Frame-Options: SAMEORIGIN` and rewrite `frame-ancestors` to `'self'` ([crud.ts L673-L685](packages/cms/crud.ts#L673-L685)).
- **Open-redirect hygiene preserved.** `handleFileServing` validates protocol before redirecting (unchanged but worth noting given thumbnails are now routed through it).
- **Layered auth on picker requests.** Auth runs before `handleList` ([mod.ts L1534-L1543](packages/cms/mod.ts#L1534-L1543)), so the `_source` token alone is not sufficient — caller must also have a valid admin session.

---

## 3. Security findings

### S1 — `handleFileServing` does **not** receive `source`, breaking puck-specific row policies (medium)

The picker browses thumbnails via `/admin/files/<table>/<col>/<id>` — a normal CMS file route. [`handleFileServing`](packages/cms/mod.ts#L1647) builds its policy context with no `source`:

```ts
const policyCtx = createPolicyContext(request, authUser); // <- no source
```

A row policy like `policies: { media: { row: (ctx) => ctx.source === 'plugin:puck' ? sql`true`: ownedBy(...) } }` lets the user _list_ media in the picker, but every thumbnail then 404s because the file fetch runs without `source`.

Two consequences:

1. **Inconsistent enforcement surface.** The same data flow (pick → fetch → render) crosses two handlers with two different policy contexts.
2. **UX symptom mistakable for a security failure.** Operators chasing why "picker shows broken images" will tend to loosen file policies in ways they don't intend.

**Fix options** (least invasive first):

- Accept and validate `_source` on `/admin/files/...` GETs the same way `handleList` does, and pass it into `createPolicyContext`.
- Or have the picker hand each thumbnail a single short-lived signed URL (table+column+id+exp, HMAC) that bypasses the policy re-check, since the picker render _just_ enforced read access for that record.

### S2 — `getPluginName(undefined)` silently produces an empty `record` for `SOURCE.CMS` tokens (medium)

[crud.ts L639-L657](packages/cms/crud.ts#L639-L657): if a `SOURCE.CMS` token is presented to picker mode, `getPluginName` returns `undefined`, the loop is skipped, and the picker emits valid HTML with `record: { id }` only.

The picker is "working" but useless — and from a security standpoint, the **threat model degrades to "any signed source token"**. Recommend rejecting non-plugin sources explicitly before rendering:

```ts
if (!getPluginName(source)) {
  return htmlResponse('Forbidden', 403, ctx.options.securityHeaders);
}
```

### S3 — Source token leaks via same-origin `Referer` to logs (medium)

The default `Referrer-Policy: strict-origin-when-cross-origin` ([http.ts L42-L46](packages/cms/http.ts#L42-L46)) does mitigate the cross-origin leak (e.g. to S3). What's left and **not mitigated**:

- The picker iframe's URL (`/admin/<table>?picker=true&_source=…`) is the `Referer` header for every same-origin subresource the iframe loads — `styles.css`, `picker.js`, every `/admin/files/<table>/<col>/<id>` thumbnail. The token ends up in your reverse-proxy / app access logs for each of those requests.
- The 4-hour token TTL is much longer than any picker session.

Recommendations:

1. Set `Referrer-Policy: no-referrer` on the picker response.
2. Add `referrerpolicy="no-referrer"` to the iframe element ([ImagePickerField.tsx L283-L292](packages/plugins/puck/fields/ImagePickerField.tsx#L283-L292)).
3. Shorten the picker token TTL (5–15 minutes is plenty for a picker session).
4. Longer-term: move the source token into a short-lived, `HttpOnly`, `SameSite=Strict` cookie scoped to `/admin/<table>?picker=true`, or use POST + form body to open the picker.

### S4 — Source token has no binding to user, table, or column (medium)

The signed payload is `${source}.${timestamp}` — that's it. Implications:

- **No user binding.** A token minted for user A is valid for user B's session. With cookie-based auth this is OK _today_, but it widens the post-compromise blast radius.
- **No table/column binding.** A puck-source token grants list access to _every_ table that has any column with `plugins.puck.role: 'source'`.
- **Long TTL.** See S3.

Suggested binding: `${source}.${userId ?? ''}.${table ?? ''}.${ts}.${sig}` and rotate at the `/admin/puck/<table>/<id>/<col>` boundary.

### S5 — `CmsContext.sourceToken` is reachable by any user-bundle module (low–medium)

The token is written to `globalThis.CmsContext.sourceToken` ([main.tsx L77-L81](packages/plugins/puck/client/main.tsx#L77-L81)) and is therefore readable by **every** module the user imports into `components.tsx`. A single compromised npm dependency in the user bundle can exfiltrate the token and silently list any picker-eligible table for ~4 hours.

Recommendations:

- Document this trust boundary in [packages/plugins/puck/README.md](packages/plugins/puck/README.md).
- Consider the token bindings from S4 above so a leaked token grants the minimum.
- Consider a server-issued one-time URL: server stores the source identity, client gets an opaque handle.

### S6 — Column read policies are honoured _implicitly_, not enforced explicitly (low, defence-in-depth)

Tracing [`filterRecordsColumns`](packages/cms/policies/apply.ts#L488-L494) and [`filterRecordColumns`](packages/cms/policies/apply.ts#L460-L478): unreadable columns are deleted from each record before the picker branch runs. The picker loop then reads `record[col.propertyName]`, which becomes `undefined` for hidden columns, and `JSON.stringify` drops them.

Net effect: column read policies _are_ honoured in the picker payload **today**.

What's fragile:

- The picker doesn't consult `columnResult.readableColumns` directly; it relies on `JSON.stringify` dropping `undefined`. Anyone who later changes `filterRecordColumns` to keep keys with `null` placeholders, or switches the picker payload encoder, breaks the security property silently.

Recommendation: add an explicit guard:

```ts
if (!columnResult.readableColumns.includes(col.name)) continue;
```

with a comment that this is the _primary_ enforcement and `filterRecordsColumns` is defence-in-depth. Lock with a unit test ("column hidden by policy → key absent from `data-picker-record`").

### S7 — Missing strict CSP on the picker page (low)

[`pickerLayout`](packages/ui/views/grid.ts#L483-L513) emits a full HTML document without `<meta http-equiv="Content-Security-Policy" …>`, and the route's `frame-ancestors` patch is a `replace()` that only fires if a previous `frame-ancestors` directive exists ([crud.ts L678-L684](packages/cms/crud.ts#L678-L684)). The default header _does_ contain `frame-ancestors 'none'` ([http.ts L42](packages/cms/http.ts#L42)), so this works in practice, but operators with a custom `csp` option that omits `frame-ancestors` get no framing protection at all.

Recommendations:

- Always set `frame-ancestors 'self'` on picker responses (don't rely on `replace()` matching).
- Emit a strict `<meta>` CSP from `pickerLayout` itself: `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'`.

### S8 — Route-level `routeSecurityHeaders` are ignored on the picker response (low)

[`createCmsHandler`](packages/cms/mod.ts#L955-L957) supports per-route CSP overrides (`routeSecurityHeaders`), but the picker branch in [`handleList`](packages/cms/crud.ts#L673-L685) reads from `ctx.options.securityHeaders` (the global default), so an operator who configures stricter CSP for the media table won't see it applied to the picker variant of the same route. Document or honour the per-route headers.

### S9 — Picker renders trigger `onAction('list', …)` audit events with no source attribution (low)

[crud.ts L569-L580](packages/cms/crud.ts#L569-L580) fires the `list` action hook before the picker branch is taken. So every picker open writes an audit log entry that is indistinguishable from a user-initiated list. Two consequences:

- Audit log noise (each Puck editor render with a picker field can fire repeatedly).
- Picker abuse cannot be distinguished from normal listing in audit logs.

Add `source` to the `onAction` call, or branch the picker off before firing the list hook (it's not really a "list" by the user — it's a picker query).

### S10 — Iframe missing `sandbox` attribute (low)

The iframe is same-origin and needs `allow-scripts allow-same-origin allow-forms`, so the value-add of `sandbox` is small, but explicitly setting it documents intent and blocks unexpected escalations (top-level navigation, popups, downloads, plugins, modals).

### S11 — Path segments interpolated without `encodeURIComponent` (very low)

- [`pickerSrc`](packages/plugins/puck/fields/ImagePickerField.tsx#L112) interpolates `table` raw.
- [`<img src>`](packages/plugins/puck/fields/ImagePickerField.tsx#L181-L184) interpolates `value.table`/`value.column`/`value.id` raw.

Persisted `value` came from a previous postMessage (server-controlled), so it's currently safe. But `value.table` / `value.column` survive in Puck JSON across sessions; if anything ever writes one with a special character, the URL becomes ambiguous. Encode all path segments.

### S12 — `record.id != null` admits empty-string IDs (very low)

[ImagePickerField L143](packages/plugins/puck/fields/ImagePickerField.tsx#L143). With well-formed server data this is fine. A defensive `typeof id === 'number' || (typeof id === 'string' && id.length > 0)` would be safer.

### S13 — Filename segment in `/admin/files/<…>/<filename>` is ignored, not validated (very low)

[mod.ts L1424-L1431](packages/cms/mod.ts#L1424-L1431) accepts `parts.length >= 3 && parts.length <= 4`. The trailing segment is discarded. `split('/')` already prevents path-traversal, but if you intend the filename to be canonical, assert it equals `fileData.filename` (or 404). At minimum, lock with a test.

---

## 4. Correctness / functional findings

### F1 — Performance regression on every grid render (medium)

Grid thumbnails used to embed a pre-signed S3 URL directly in `<img src>`. They now point at `/admin/files/<table>/<col>/<id>` which 302-redirects to a freshly signed URL with `Cache-Control: private, no-store` ([mod.ts L1782-L1789](packages/cms/mod.ts#L1782-L1789)).

Three render paths now hit the proxy:

1. Grid view ([crud.ts L697-L711](packages/cms/crud.ts#L697-L711))
2. Panel preview ([grid-helpers.ts L130-L138](packages/cms/grid-helpers.ts#L130-L138))
3. Picker ([crud.ts L606-L618](packages/cms/crud.ts#L606-L618))

For a 100-image grid: 100 redirects + 100 DB lookups + 100 signing calls **per page render**, with zero browser caching.

> The inline comment in [crud.ts L601-L603](packages/cms/crud.ts#L601-L603) claims the proxy URL is "smaller HTML, browser-cacheable" — the second part is incorrect given `private, no-store` on the redirect.

Recommendations:

- Add `Cache-Control: private, max-age=60, must-revalidate` to the redirect response itself. The 302 body is empty; only the `Location` header carries the signed URL, which has its own short expiry. A 60-second cache of the _redirect_ slashes server load by ~98% during browsing.
- Or: reintroduce inline pre-signing for grid rendering when storage is configured, and reserve the proxy for picker postMessage payloads.

### F2 — `value?.id === 0` renders the empty placeholder (real bug, easy fix)

[ImagePickerField L181-L184](packages/plugins/puck/fields/ImagePickerField.tsx#L181) uses `value?.id ? <img …> : <placeholder>`. With integer-0 PKs (legal in many schemas) the field shows "No image selected".

```diff
-{value?.id
+{value?.id != null
```

The same predicate at [L143](packages/plugins/puck/fields/ImagePickerField.tsx#L143) is already correct (`record?.id != null`). Inconsistent.

### F3 — `column` and `table` in `SelectedImage` come from parent props, not the picker (real bug)

[L138-L150](packages/plugins/puck/fields/ImagePickerField.tsx#L138-L150):

```ts
onChange({
  id: record.id,
  table: event.data.table || table,   // good
  column,                             // <- always the parent-prop column
  ...
});
```

If a developer points the picker at a `photos` table whose file column is `image`, but doesn't override `column='image'` on the field, the iframe **displays** the right thumbnails (server uses its own `thumbnailField`), but the persisted `SelectedImage.column` is `'file'`, and `<img src="/files/photos/file/123">` will 404.

Fix: have the picker postMessage include `column: thumbnailField.column.name` and have the parent prefer that over its own prop.

### F4 — Picker has no pagination (medium UX)

[`pickerGridView`](packages/ui/views/grid.ts#L408-L420) renders only `<header>` + `gridItems`. There's no pagination control and no preserved pagination links. With a default page size of (e.g.) 20 and 200 images, the user can only ever see the first 20.

Either:

- Render pagination links inside the picker (preserving `?picker=true&_source=…`), or
- Add a simple search/filter, or
- Document the limit and bump default page size for picker mode.

### F5 — Picker mode falls through to the full admin UI when there is no `thumbnailField` (UX/info-leak)

[crud.ts L597](packages/cms/crud.ts#L597) is `if (pickerMode && thumbnailField)`. If a plugin opens the picker on a table with no thumbnail field, the iframe receives the **full sidebar/nav admin layout**. Not a security escalation (user already has access), but it leaks the navigation/structure into a context where it shouldn't be visible, and lets the user navigate elsewhere inside the iframe.

Either return 400/empty in this case, or render `pickerLayout(emptyState)`.

### F6 — `dialog.showModal()` may throw when re-opened (minor)

[ImagePickerField L172](packages/plugins/puck/fields/ImagePickerField.tsx#L172): if `isOpen` is already `true` and `openPicker` is called again, `showModal()` throws `InvalidStateError`. Guard with `if (!dialogRef.current?.open) dialogRef.current?.showModal();`.

### F7 — `useEffect` dependency includes unstable `onChange` (perf, minor)

[L127](packages/plugins/puck/fields/ImagePickerField.tsx#L127): Puck doesn't memoize `onChange` between renders, so the message-listener effect re-registers on every parent render whenever `isOpen` is `true`. Stash `onChange` in a ref.

### F8 — `<dialog>` accessibility (minor)

The `<dialog>` has no `aria-label` / `aria-labelledby`, no autofocus on open, and no explicit focus return on close. Minimum:

- `aria-labelledby="picker-title"` on the dialog
- `id="picker-title"` on the `<strong>Select Image</strong>`
- Restore focus to the trigger button on close

### F9 — `CmsContext` is mutable global; load-order race (minor)

[main.tsx L25-L31, L77-L82](packages/plugins/puck/client/main.tsx#L25-L82) sets `globalThis.CmsContext = {}` at module load and **then** populates it inside `initPuckEditor`. Any user component module that reads `CmsContext.sourceToken` at _import time_ (top-level code) sees `undefined`. The current `ImagePickerField` reads it inside the function body, so it's fine — but document the rule, or freeze `CmsContext` after init and throw on early access.

### F10 — Demo `Image` uses two different public URLs for the same file (real bug)

[apps/demo/components.tsx](apps/demo/components.tsx) renders the editor preview using `/admin/files/${m.table}/${m.column}/${m.id}` but the public site uses `/files/${m.table}/${m.id}/${filename}` (no `column` segment). Two different cache keys, two different access policies, two different ways to be wrong. Recommend a single `assetUrl(media)` helper exported from one place.

### F11 — `getPluginName(undefined)` empty-record case → confusing UX (covered by S2)

Behaviour-wise, picker users would see clickable thumbnails that produce useless `onChange` payloads. Fixed by S2's reject.

### F12 — `gridItems` empty-state branch is duplicated (trivial)

[grid.ts L181-L199](packages/ui/views/grid.ts#L181-L199) has identical `pickerMode` and non-`pickerMode` empty states. The branch can be removed.

### F13 — `pickerGridView` wraps content in non-picker grid classes (minor)

[grid.ts L408-L420](packages/ui/views/grid.ts#L408-L420) uses `cms-grid-content` / `cms-grid-main`, which are sized for the full admin layout. In a picker iframe (no sidebar/panel) they may render with unintended widths/margins. Consider a dedicated `cms-picker-grid` wrapper, or call `gridItems` directly inside `cms-picker-view`.

### F14 — Picker payload size scales with `data-picker-record` JSON per item (minor)

With (e.g.) `alt` opted in and 200-character alt strings, a 100-item picker grows by ~25 KB of HTML. A single inlined `<script>` with `JSON.parse` of a per-item array would be smaller, at the cost of needing a CSP hash/nonce for inline JSON.

### F15 — Picker payload includes the file column **only** if it opts in as `source` — field assumes it does (UX gotcha)

[ImagePickerField L141](packages/plugins/puck/fields/ImagePickerField.tsx#L141): `const file = record?.[column];`. If the schema doesn't opt the file column into `plugins.puck.role: 'source'` (the secure default), `file` is `undefined`, so `filename` stays empty. The picker still works because the field falls back to the proxy URL by `id`, but the on-page label says `ID: 123` instead of `sunset.jpg`.

Document the requirement _and_ lock with a test.

### F16 — `pickerScript` minor polish (trivial)

- Uses `var` (works; flag only).
- `'use strict'` is fine inside the IIFE; ESM modules would be implicitly strict.

### F17 — Demo `Image` still uses `puck.isEditing` shape that may not exist on all Puck render contexts (minor)

```ts
const isEditing = (puck as { isEditing?: boolean })?.isEditing;
```

This is the documented shape, but the cast hides the assumption. Worth a comment or a typed import.

---

## 5. Test coverage

The new [integration_picker_test.ts](packages/cms/tests/integration_picker_test.ts) is excellent — it covers:

- Secure-by-default opt-in
- Custom PK / file column names
- Plugin isolation (`puck` vs `tinymce`)
- `thumbnail: true` _without_ `role: 'source'` excluded
- Missing token → 403
- Invalid token → 403

Suggested additions:

- **`ctx.source` reaches policies.** Assert that a row policy receives `'plugin:puck'` when called from picker mode.
- **CMS-source token rejected for picker** (S2). Currently silently degrades to PK-only payload.
- **Expired source token rejected** (validator handles it; locks the contract).
- **Column hidden by policy → absent from picker payload** (S6 defence-in-depth contract).
- **`/admin/files/...` returns 404 for picker-only readable rows when `source` not propagated** (current bug, S1).
- **Same-origin postMessage spoof rejection.** Spawn a fake message with `event.source` from a different iframe; assert handler ignores it.
- **`Referrer-Policy` and complete CSP headers** on picker response (after fix).
- **Filename redirect path correctness.** `parts.length === 4` branch in [mod.ts L1429](packages/cms/mod.ts#L1429) — confirm no path-traversal / surprises.
- **Grid mode with `storage` configured** still works after the proxy-URL switch (existing test only changes the assertion, not coverage of S3 redirect behaviour).
- **Unhappy thumbnail value paths.** Records where `value` is a string URL, base64, or null — confirm `resolveThumbnailUrl` fallback works in the picker branch specifically.

---

## 6. Documentation gaps

- The **threat model** for `CmsContext.sourceToken` (it's reachable by any code in the user's components bundle) deserves a callout in [packages/plugins/puck/README.md](packages/plugins/puck/README.md).
- The `role: 'source'` opt-in is excellent but the only place it's explained is the schema diff in `apps/demo/schema.ts`. Add a short table in [packages/cms/README.md](packages/cms/README.md) covering: `thumbnail` (rendering only) vs `role: 'source'` (data exposure to plugin) vs `role: 'output'` (hidden from forms) vs `role: 'data'` (default).
- The picker `_source` token URL exposure should be documented in an **operator's** security checklist (Referrer-Policy guidance, log retention, rotating `csrfSecret`).

---

## 7. Smaller suggestions

- Replace the inline `style={{...}}` in `ImagePickerField` with class names so consumers can theme the picker. Inline styles also push toward `style-src 'unsafe-inline'`, which is unfortunate on a security-conscious project.
- Consider also persisting `storage` (the storage provider id) in `SelectedImage` so renamed/multi-storage setups can resolve files later.
- `packages/cms/mod.ts` `/files` route: prefer `parts.length === 3 || parts.length === 4` for readability over the range comparison.
- `data-picker-record="${raw(recordJson)}"` in [grid.ts](packages/ui/views/grid.ts) — `recordJson` is already HTML-escaped via `escapeHtml`, so wrapping with `raw()` is correct, but a comment explaining "escapeHtml runs first; raw() prevents the template tag from escaping again" would prevent future "let's clean this up" regressions.
- `COMPARE.md` (untracked) and `apps/demo/site/static/styles.css` (unstaged) are present in the working tree but not part of the branch. Either commit intentionally or revert before merging.

---

## 8. Recommended priority order

1. **S1** — propagate `source` to `/admin/files/...` so policies behave consistently across handlers.
2. **S2** — explicitly reject non-plugin sources in picker mode.
3. **F1** — add `Cache-Control` to thumbnail proxy redirects (or restore inline pre-signing for grid view).
4. **S3 / S10** — `Referrer-Policy: no-referrer` on response and iframe; consider shorter token TTL; explicit `sandbox`.
5. **F2 / F3** — `id=0` placeholder bug and `column` mis-coordination on non-default file columns.
6. **S6** — explicit `readableColumns` check in the picker loop (defence in depth) + test.
7. **S4** — narrower source-token binding (user/table) — design discussion.
8. **S9 / F4** — audit-log attribution and picker pagination.
9. **S7 / S8** — strict CSP on picker response and per-route headers honoured by picker.
10. Remaining UX/a11y/polish items (F5–F17, S5, S11–S13).

---

## 9. Net assessment

A solid, security-aware feature. The crypto and postMessage primitives are sound. The remaining work is primarily about how those primitives are plumbed across the two handlers (`handleList` vs `handleFileServing`), one performance regression, a couple of real React bugs (`id=0`, `column` mis-coordination), and the usual hardening polish (CSP, Referer, sandbox, token bindings). None of the issues are blockers for the design — they're refinements before the feature ships.

---

## 10. Progress checklist

Use this when iterating on the branch. Tick items as they land.

### Security

- [x] **S1** Propagate validated `_source` into `handleFileServing`'s `policyCtx` (or move thumbnails to short-lived per-record signed URLs).
- [x] **S2** Reject non-plugin sources in picker mode (`getPluginName(source) === undefined` → 403).
- [x] **S3** Add `Referrer-Policy: no-referrer` to picker response and `referrerpolicy="no-referrer"` to the iframe; shorten source-token TTL. _(headers + iframe attribute landed; TTL shortening still pending)_
- [ ] **S4** Bind source token to user (and ideally table); rotate at editor open.
- [ ] **S5** Document `CmsContext.sourceToken` trust boundary; consider opaque server-issued handle.
- [x] **S6** Add explicit `readableColumns` check in the picker loop + test.
- [ ] **S7** Always set `frame-ancestors 'self'` on picker response; emit strict `<meta>` CSP from `pickerLayout`.
- [ ] **S8** Use per-route `routeSecurityHeaders` for picker responses too.
- [ ] **S9** Pass `source` into `onAction('list', …)` (or skip the hook for picker queries).
- [x] **S10** Add explicit `sandbox="allow-scripts allow-same-origin allow-forms"` to the iframe.
- [x] **S11** `encodeURIComponent` all path segments in `pickerSrc` and `<img src>`.
- [x] **S12** Validate `record.id` shape (number or non-empty string) in postMessage handler.
- [ ] **S13** Validate (or 404) the optional `filename` segment in `/admin/files/...`.

### Correctness / UX

- [x] **F1** Add `Cache-Control: private, max-age=60, must-revalidate` to `/admin/files/...` redirects (or restore inline signing for grid).
- [x] **F2** Fix `value?.id` truthiness — use `value?.id != null`.
- [x] **F3** Have the picker postMessage include `column` from the server's `thumbnailField`; field should prefer that.
- [-] **F4** Add pagination (or search) to picker view.
- [x] **F5** Reject (or render empty layout for) picker requests on tables without a `thumbnailField`.
- [x] **F6** Guard `dialog.showModal()` against re-open.
- [x] **F7** Stash `onChange` in a ref to stop listener churn.
- [x] **F8** Add `aria-labelledby`, autofocus, and focus-return to the dialog.
- [ ] **F9** Document `CmsContext` load-order rule; consider freezing after init.
- [ ] **F10** Unify editor-vs-public file URL via a single `assetUrl(media)` helper in the demo.
- [x] **F12** Remove duplicated `gridItems` empty-state branch.
- [w] **F13** Use a dedicated `cms-picker-grid` wrapper (drop `cms-grid-content`/`cms-grid-main`).
- [ ] **F15** Document and test the picker fallback when the file column isn't a `source` column.

### Tests

- [ ] Test `ctx.source === 'plugin:puck'` reaches row policies in picker mode.
- [x] Test S2 (CMS-source token → 403 in picker mode).
- [ ] Test expired source token → 403.
- [x] Test column hidden by policy → key absent from `data-picker-record` (S6 contract).
- [ ] Test S1 fix: picker thumbnails 200 when row policy uses `ctx.source`.
- [ ] Test postMessage spoof rejection (different `event.source` is ignored).
- [ ] Test picker response includes `Referrer-Policy: no-referrer`, full CSP, and `frame-ancestors 'self'`.
- [ ] Test `/admin/files/<…>/<filename>` (4-segment) path correctness and traversal-safety.
- [ ] Test grid view with `storage` configured (post proxy-URL switch).
- [ ] Test picker behaviour with non-`FileReference` thumbnail values.

### Docs

- [ ] Add a `role: 'source' | 'output' | 'data'` reference table to [packages/cms/README.md](packages/cms/README.md).
- [ ] Document `CmsContext.sourceToken` trust boundary in [packages/plugins/puck/README.md](packages/plugins/puck/README.md).
- [ ] Add a picker-mode operator security checklist (Referrer-Policy, log retention, secret rotation).

### House-keeping

- [ ] Decide what to do with untracked `COMPARE.md` and unstaged `apps/demo/site/static/styles.css` before merge.
- [x] Fix the misleading "browser-cacheable" comment at [crud.ts L601-L603](packages/cms/crud.ts#L601-L603).

---

## 11. Final review pass — additional notes

A last sweep over the diff confirmed:

- **`data-picker-record` XSS path is clean.** `JSON.stringify` → `escapeHtml` → wrapped in double-quoted attribute. `"` inside the JSON becomes `&quot;`, the browser decodes it on `dataset.pickerRecord` read, and `JSON.parse` succeeds. No escape-bypass via `</script>` because we are inside an attribute, not a `<script>` block. Unicode line separators (U+2028/U+2029) only matter inside `<script>`, not attributes. Safe.
- **`data-picker-id` and `data-picker-table` are auto-escaped** by the `html` template tag — confirmed in [grid.ts L219-L220](packages/ui/views/grid.ts#L219).
- **`pickerScript` posts `id` as a string** (`dataset.pickerId`) under `event.data.id`, while `event.data.record.id` is the original numeric value. The React handler correctly reads `record.id`; if any future consumer reads `event.data.id` they'll get a string. Worth a one-line comment in the script.
- **Stand-alone picker page open** (e.g. user pastes `/admin/media?picker=true&_source=…` into a new tab): clicking an item posts to `window.parent === window` (no-op). Not a security issue, but a minor UX paper-cut — picker is silently inert outside an iframe. Could log a console warning.
- **No tests exist for the 4-segment `/admin/files/<…>/<filename>` route** ([mod.ts L1429](packages/cms/mod.ts#L1429)) — already in the test gaps list above.
- **`thumb.id` interpolation** in `data-picker-id="${thumb.id}"` accepts either number or string; the `html` template tag handles both. No issue.

No new high-severity findings from the final pass.
