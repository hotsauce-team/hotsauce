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
- [ ] **Real AWS S3 testing** — Demo only tested with MinIO; need to verify SigV4 with actual AWS
- [ ] **IAM role credential support** — Use EC2/ECS instance profiles instead of long-lived access keys in env vars (IMDS v2)
- [x] **Unify ErrorContext and PluginErrorContext** — `hookContext` on `PluginErrorContext`, `plugin` on `ErrorContext`

## Before Merge

- [ ] **Documentation review** — Ensure README, SPEC, and inline docs are accurate and complete
- [ ] **Security peer review** — External review of key tampering prevention, presign flow, and policy enforcement
- [ ] **S3 README uses old storage API syntax** — Shows `{ defaultObjectStorageId: 's3' }` instead of simplified `storage: 's3'`

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
