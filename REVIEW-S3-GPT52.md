# Security Review — S3 Storage branch (vs `main`)

## Scope

This branch introduces a new S3-compatible storage plugin plus core/CMS/UI plumbing for file fields, presigned uploads, file serving, and plugin routes.

High-signal areas reviewed:

- S3 signing + presigning logic: `packages/plugins/s3-storage/*`
- File reference + key validation: `packages/core/extend/file.ts`
- CMS CRUD + file serving + storage cleanup + plugin routes: `packages/cms/*`
- Worker/plugin isolation and UI override validation: `packages/workers/executor.ts`
- UI rendering of file fields/links: `packages/ui/*`

## Overall assessment

Strong security posture improvements overall (CSRF enforcement, source tokens, policy-aware file serving, safer plugin UI overrides). The main remaining risks are (a) places where `FileReference.url` / external URLs are rendered without protocol validation, and (b) a couple of “trust the DB” code paths where a tampered record could cause arbitrary-key signing/deletion.

## What looks good

### CSRF + write provenance

- **CSRF validation added/extended** for:
  - built-in CRUD create/update (form `_csrf`)
  - built-in delete (POST)
  - **plugin routes** (POST) via `X-CSRF-Token` header or `_csrf` form field
- **Source tokens** (`_source`) are required for write operations, and policies can be re-evaluated with `ctx.source`.
  - This is a nice “write provenance” primitive: it prevents a class of confused-deputy/plugin-vs-core write bugs.

### Policy-aware file serving

- New file endpoint: `GET {basePath}/files/{table}/{column}/{id}` is a good security pattern:
  - verifies column is a declared file field (`cmsOptions.file`)
  - enforces row + column read policies
  - uses `302` to S3 signed URLs with protocol checks (http/https only)
  - serves DB-inline file bytes with **tight file-specific CSP**, `nosniff`, and avoids inlining SVGs by using `attachment`.

### Plugin isolation hardening

- `packages/workers/executor.ts` now:
  - sanitizes Worker error propagation (full error goes to server-side `onError`, but thrown error is generic)
  - validates `FieldUIOverride` URLs to block `javascript:`, `data:`, scheme-relative `//...`, and control-char obfuscation.

### CSP configuration validation

- `validateCspOptions()` ensures CSP extension origins are real `http(s)` **origins only** (no path/query), which prevents CSP injection via user config.

## Issues / risks (security-focused)

### 1) Arbitrary object-key signing/deletion if DB is tampered (Medium) (Addressed)

There are a couple places that assume the DB only contains keys minted by the CMS:

- File serving (`handleFileServing`): if a stored `FileReference` contains a `key`, it will call `provider.signDownloadUrl({ key })` without verifying the key belongs to `{table}/{column}/{recordId}/...`.
- Old-object deletion (`deleteOldFileObjects`): deletes `oldValue.key` if present, without validating it against the expected prefix.

Why this matters:

- You _do_ validate new keys on update via `isValidFileKey(key, table, column, recordId)`, which blocks the normal attack route.
- However, DB tampering (or legacy data) could still turn `/files/...` into an oracle for signing arbitrary keys, and “clear/replace” into an arbitrary-key delete.

Suggested mitigation (low-cost, defense-in-depth):

- Before signing or deleting, validate keys with `isValidFileKey(key, tableName, columnName, recordId)`.
- If invalid: return `404` for serving and skip deletion.

Resolution:

- `handleFileServing`: validates key prefix before signing, returns 404 if invalid
- `deleteOldFileObjects`: validates key prefix before deletion, skips and logs via `onError` if invalid
- Tests added for both positive and negative cases

### 2) `FileReference.url` safe-scheme checks in UI (Medium) (Addressed)

UI rendering now treats `FileReference.url` as untrusted input and gates it through `getSafeUrl()` before using it in `href`/`src` contexts.

Residual risk (still relevant): even “safe” `http(s)` URLs can be used for tracking/exfiltration if you loosen CSP; prefer policy-aware `/files/...` links when possible.

### 3) Reverse tabnabbing in file download link (Low → Medium) (Addressed)

The file “Download” link now includes `rel="noopener"` alongside `target="_blank"`, preventing reverse-tabnabbing.

### 4) SVG preview via `<img>` (Low, but worth hardening) (Addressed)

`handleFileServing` deliberately avoids serving SVG inline, and UI previews now gate SVG rendering on an opt-in `file.previewSvg` config option (default: `false`).

Resolution:

- SVG is non-previewable by default (shows metadata + download only).
- Integrators can opt-in per column: `$cms({ file: { previewSvg: true } })`.

### 5) Presigned PUT binds request `Content-Length`/`Content-Type` (but not bytes) (Updated)

The presign flow signs **additional request headers** for uploads (`Content-Length` and `Content-Type`) and returns those headers to the browser to send verbatim.

Security implication:

- **Good:** S3/MinIO will reject uploads where the request’s `Content-Length` or `Content-Type` differs from what was signed (typically as `SignatureDoesNotMatch`). This closes the “presign small, upload big” gap for clients that send these headers.
- **Remaining:** This still does **not** prove the uploaded bytes match the MIME type. A client can upload arbitrary bytes while presenting a signed `Content-Type` header value.

Operational/compatibility note:

- Signing more headers increases coupling to client/server behavior. Some upload paths (streaming/chunked transfer, intermediaries that omit/normalize headers, or certain S3-compatible vendors) may fail if they can’t reproduce the signed header set exactly.

Mitigation options (depending on strictness):

- Keep PUT+signed headers (current approach) and document the constraints (client must send exact `Content-Length`/`Content-Type`).
- If you need storage-enforced _ranges_ (not exact lengths), consider presigned POST policies (`content-length-range`).
- If you need byte-level type validation, you need a separate content sniffing/processing step (not provided by SigV4 signing).

### 6) Orphan cleanup can be used as a performance lever (Low → Medium DoS)

`cleanupOrphanFileObjects()` can call `provider.listObjects(prefix)` during an update. The S3 plugin implementation:

- does not paginate
- parses XML with regex

Risk:

- A prefix with many objects can slow down updates (and could be weaponized if an attacker can cause many uploads under one prefix).

Suggested mitigation:

- Add paging/limits (`max-keys`) and continuation handling, or cap deletions per request.
- Consider making orphan cleanup asynchronous/out-of-band.

### 7) In-process plugin routes can weaken security headers (Footgun)

For in-process plugin route handlers that return `Response` with `text/html`, CMS merges defaults but **plugin headers win** (including CSP).

This is probably acceptable (plugins are integrator-controlled), but it’s worth calling out in docs:

- If a plugin route sets a permissive CSP, it can re-enable XSS primitives for that page.
- Consider optionally enforcing non-negotiable headers like `frame-ancestors 'none'`.

## Test status

- `deno task test` passed: `1145 passed | 0 failed`.

## Suggested follow-ups (ordered)

1. ~~Add key-prefix validation in file serving + deletion paths (defense-in-depth).~~ ✅ Done
2. ~~Disable SVG previews.~~ ✅ Done (opt-in via `previewSvg`)
3. Document the “PUT presign doesn’t bind type/size” tradeoff; optionally add backend enforcement guidance.
4. Put guardrails around orphan cleanup cost (paging/limits or async).

### Deeper review

This section explores additional security avenues beyond the immediate S3/file UX.

#### Trust boundaries / threat model notes

- **Plugins are integrator-controlled code**. Treat plugin routes and in-process hooks as trusted (they can always weaken headers, call internal services, etc.). The CMS can still provide guardrails to reduce footguns.
- **The database is treated as the source of truth**, but some code paths assume the DB only contains CMS-minted `FileReference` keys/URLs. Defense-in-depth validation is worthwhile because “legacy data”, direct DB edits, or compromised write paths do happen.
- **Workers are isolation, not sandboxing**: the host decides Worker permissions. The executor’s job is to prevent accidental data leaks and enforce serialization/shape invariants.

#### XSS / HTML injection surface (admin UI)

- **`FileReference.url` is currently an untrusted string rendered into `href` and `src`** in UI code paths. Even if your normal flow never populates it from user input, it’s part of the record and could be introduced by:
  - a custom API endpoint,
  - a misconfigured `parser` that allows arbitrary JSON,
  - a compromised plugin.
    Recommended hardening: validate URLs before rendering and/or remove support for rendering arbitrary URLs in core UI.
- **S3 upload page `accept` attribute is inserted via `raw(acceptAttr)`**. Today, `accept` originates from schema config, but it’s still a direct HTML attribute injection primitive if it ever becomes user-controlled. Prefer building the `<input>` via `attrs({ accept })` rather than string concatenation.
- **Inline JS confirm() CSP change**: allowing `'unsafe-hashes'` with a single hash is a reasonable compromise for inline event handlers, but it increases CSP complexity. Consider refactoring the confirm logic to a non-inline script to remove `'unsafe-hashes'` entirely.

#### Open redirects / external navigation

- File serving redirects (`302 Location`) now gate on `http/https`, which is good.
- However, **host allowlisting is not enforced**. If an attacker can write a URL into a file record (or a plugin returns one), the admin may be redirected to arbitrary external domains. If you want a stricter posture, add optional allowlists per storage provider or per CMS `csp` config.

#### CSRF coverage and “write provenance”

- CSRF is applied broadly to built-in POSTs and plugin POST routes, which is good.
- The addition of `_source` tokens materially reduces the risk of confused-deputy writes (e.g., “plugin route can update fields the normal form couldn’t”).
- Watchouts:
  - Ensure cookies used for auth are `SameSite=Lax` or `Strict` (outside this diff, but important for CSRF posture).
  - Consider whether `DELETE` should be accepted (currently delete uses POST in built-in UI, which is fine).

#### Authorization / policy edges

- Plugin routes get **three layers** of protection in this branch:
  1. registry requires a `filter` for any plugin with routes,
  2. router enforces auth + `canAccess` for table-derived routes,
  3. `handlePluginRoute()` applies row + column policies before populating record/field context.
- One nuance: `canAccess()` is only applied when the plugin route pattern contains a `:table` param. For routes without table params, you rely entirely on the plugin’s `filter` (and whatever the route itself does). This is correct but should be documented as a sharp edge.

#### Storage key integrity / tampering

- Update flow correctly validates:
  - key prefix belongs to `{table}/{column}/{recordId}/...` (`isValidFileKey`)
  - storage provider matches `resolveStorage()` / default
- Remaining defense-in-depth opportunities:
  - validate keys again when _serving_ or _deleting_ objects, since those paths can be reached from tampered DB rows.
  - validate bucket names and (optionally) restrict `endpoint/publicEndpoint` to `http(s)` at config validation time.

#### SigV4 implementation and credential model

- The SigV4 implementation is dependency-free and uses WebCrypto, which is good.
- Notable limitations / considerations:
  - **No support for session tokens** (`X-Amz-Security-Token`) used with STS/temp creds; without it, many AWS setups can’t use this plugin safely.
  - Signing-key cache key does not include `secretAccessKey`; secret rotation for the same access key ID during the day can cause temporary signature failures (availability).
  - Presigned PUT uses `UNSIGNED-PAYLOAD`. Upload requests are additionally bound by signing `Content-Length` and `Content-Type`, but this is still header-level (not byte sniffing) and can be brittle across clients/vendors.

#### DoS / performance / operational security

- Multipart parsing (`request.formData()`) is inherently memory/CPU sensitive across runtimes; max-size checks help, but note that parsing the body may already incur cost before validation.
- Orphan cleanup:
  - listing objects on every update can be expensive,
  - regex XML parsing can be slow for large responses,
  - lack of pagination increases worst-case time.
    Stronger approach: cap work per request and/or move orphan GC to a background job.
- Presign endpoints can be hammered: consider rate-limiting at the app/server layer and monitoring.

#### Error handling and secret leakage

- Worker error strings are intentionally not propagated to end users, reducing accidental secret leakage.
- `onError` receives full hook context and full error; this is great for ops, but ensure docs warn integrators not to log raw contexts if they might contain secrets/PII.

#### Security headers and plugin routes

- Built-in `securityHeaders` are applied broadly.
- For plugin routes returning HTML `Response`, plugin-set CSP can weaken protections. If you want a “minimum bar”, consider enforcing a non-overridable subset (e.g., `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`).
