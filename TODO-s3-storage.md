# S3 Storage Feature - TODO

## Must Fix (from PR review)

- [x] **Image preview for non-image files** — `fileUrl` renders `<img>` for PDFs; check `contentType` starts with `image/` ✅ bfaf705
- [x] **fileUrl XSS validation** — Plugin-provided URLs should block dangerous schemes like `javascript:` ✅ 80319a2
- [x] **Storage key validation gap** — Missing `storage` field bypasses mismatch check; normalize or require when `key` present ✅ 998fdb7
- [x] **Presign `size: 0` bug** — Falsy check treats 0 as missing; add proper type validation ✅ 9b1e5c1
- [x] **README docs mismatch** — Says `urlExpiry` but code uses `expirySeconds` (default 900, not 3600)
- [x] **Content-type docs incorrect** — Says "content-type restriction" but presign doesn't sign it

## Must Fix

- [x] **CSP blocking S3 images on admin screens** — Allow S3/MinIO endpoint in `img-src` directive for detail/list views
- [-] **Orphan GC** — Documented but not implemented; uploaded files that never get attached to a record accumulate
- [-] **Frontend URL signing** — Expose S3 plugin's `signDownloadUrl` for use on public site (currently only works in CMS handler context)

## Should Add

- [x] **Upload progress indicator** — XHR progress bar on S3 upload page
- [x] **Max file size validation** — Validate before presign, not just after upload fails
- [-] **Real AWS S3 testing** — Tested with MinIO; AWS/B2/Hetzner Object Storage to be verified later
- [-] **IAM role credential support** — Use EC2/ECS instance profiles instead of long-lived access keys in env vars (IMDS v2)
- [x] **Unify ErrorContext and PluginErrorContext** — `hookContext` on `PluginErrorContext`, `plugin` on `ErrorContext` ✅ 0499fe6, 25b6a6a

## Before Merge

- [x] **Documentation review** — Ensure README, SPEC, and inline docs are accurate and complete ✅ c9b3d0b
- [ ] **Security peer review** — External review of key tampering prevention, presign flow, and policy enforcement
- [x] **S3 README uses old storage API syntax** — Shows `{ defaultObjectStorageId: 's3' }` instead of simplified `storage: 's3'`

## Copilot PR Review (PR #36)

### Security — Must Fix

- [x] **Column auth uses `request.method` not `routeAction`** — Plugin route column policy checks use `request.method === 'POST'` to decide read vs write; PUT/PATCH/DELETE treated as read-only. Use `routeAction`/`inferPluginRouteAction()` instead (`mod.ts` L573-574) [#discussion_r2970347390](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970347390)
- [x] **Upload page XSS** — Escape `table`, `id`, `column` with `escapeHtml()` from `@hotsauce/ui` [#discussion_r2970063213](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970063213)
- [x] **Plugin route responses missing security headers** — CMS enforces all security headers on plugin HTML responses; plugins cannot override CSP (strengthened from "plugin headers win" to "CMS headers win") [#discussion_r2970063199](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970063199) [#discussion_r2970063204](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970063204)
- [-] **POST body unbounded read** — Deferred to #39. Auth-gated (low risk); per-route `maxBodySize` design agreed [#discussion_r2970347434](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970347434)

### Storage Validation — Should Fix

- [x] **`expectedStorageId` not validated against registered providers** — `resolveStorage` can return an ID not in `options.storage.instances`; save succeeds but file serving/deletion fails later [#discussion_r2969771385](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2969771385)
- [x] **DB-routed column accepts `key`** — When `resolveStorage` returns `undefined` (inline DB storage), client can still submit a `key` field and pass validation. Reject `key` when no storage provider expected [#discussion_r2970063187](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970063187)
- [x] **Normalize missing `storage` field instead of rejecting** — When `expectedStorageId` is set and `fileRef.key` exists but `storage` is missing, set `storage = expectedStorageId` rather than rejecting (matches `FileReference` documented fallback behavior) [#discussion_r2970347412](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970347412)

### Minor

- [x] **`fileUrl`-only FieldUIOverride fails validation** — Added `fileUrl` to minimum-shape check [#discussion_r2969771415](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2969771415)
- [x] **Docker healthcheck uses `mc`** — Works fine; `minio/minio:latest` includes `mc`. Won't fix. [#discussion_r2970347424](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970347424)
- [x] **Demo schema `maxSize` missing** — Stale review comment; no misleading comment in current code. Won't fix. [#discussion_r2970063232](https://github.com/hotsauce-team/hotsauce/pull/36#discussion_r2970063232)

## Nice to Have

- [-] **In-form upload JS** — Upload without leaving the edit page (currently redirects to standalone upload page)
- [-] **Media library UI** — Browse/select from previously uploaded files (separate milestone per spec)
- [-] **CDN integration docs** — Example CloudFront/R2 CDN configuration
- [-] **Expose policy API** — Let devs reuse CMS policies in their app routes (noted in README as future consideration)
- [x] **Create-time S3 uploads** — `$cms({ autoDraft: true })` inserts draft row on "Create New", redirects to edit (#38)

## Done

- [x] Key tampering prevention (Finding 2)
- [x] Storage cleanup on record delete
- [x] Simplified storage API (`storage: 's3'` or function)
- [x] `onError` calls in create/update handlers
- [x] Demo S3 config extraction with URL style auto-detection
