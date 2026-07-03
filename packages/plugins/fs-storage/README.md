# @hotsauce/plugins/fs-storage

Filesystem storage for HotSauce CMS file uploads.

Stores uploaded files on the local filesystem (or any injected
`FileSystemAdapter`) and **serves them from your application server itself** — no
nginx, CDN, or external object store required. A static file server can still be
put in front when you want one (see [Serving with nginx / caddy](#serving-with-nginx--caddy)).

It's the local-disk counterpart to [`@hotsauce/plugins/s3-storage`](../s3-storage/README.md)
and implements the same storage-agnostic `StorageProvider` contract, so files
are routed, downloaded, deleted, and orphan-cleaned by the CMS exactly the same
way.

## How it differs from S3

With S3 the browser uploads bytes **directly** to the bucket using a presigned
URL, and downloads come straight from S3/the CDN. The CMS never touches the
bytes.

A browser can't write to your server's disk that way, so this plugin keeps the
byte path inside the CMS:

- **Upload** — the plugin mints a short-lived, HMAC-signed upload token bound to
  the table/column/record/key/size, then receives the raw file bytes on its
  **own** `_upload` route and streams them to disk. (The route declares
  `bodyType: 'stream'`, so the body is delivered as a byte stream — the file is
  sent as-is, with no base64 or JSON wrapper, and is never fully buffered.)
- **Download** — `signDownloadUrl()` returns an absolute, token-signed URL to
  the plugin's **own** `_serve` route, which streams the file from disk with
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a
  strict `Content-Security-Policy`. The CMS `/files/` route still enforces
  row/column policies, then 302-redirects to it.

## Installation

**Deno / JSR** — the plugin ships as part of the `@hotsauce/plugins` package:

```bash
deno add jsr:@hotsauce/plugins
```

```ts
import { createFsStoragePlugin } from '@hotsauce/plugins/fs-storage';
```

**Node / npm** — published standalone as
[`@hotsauce/plugins-fs-storage`](https://www.npmjs.com/package/@hotsauce/plugins-fs-storage)
(note the different import specifier):

```bash
npm install @hotsauce/plugins-fs-storage
```

```ts
import { createFsStoragePlugin } from '@hotsauce/plugins-fs-storage';
```

Sub-exports follow the same shape on both registries: types at
`@hotsauce/plugins/fs-storage/types` (JSR) /
`@hotsauce/plugins-fs-storage/types` (npm).

## Usage

```typescript
import { createCmsHandler } from '@hotsauce/cms';
import { createFsStoragePlugin } from '@hotsauce/plugins/fs-storage';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  plugins: [
    createFsStoragePlugin({
      basePath: '/admin',
      rootDir: './uploads',
      // Used to sign upload/download tokens. Falls back to CMS_CSRF_SECRET.
      signingSecret: process.env.CMS_CSRF_SECRET!,
    }),
  ],
  // Route all file fields to the filesystem (simple string)
  storage: 'fs',
  // Or per-column: storage: (ctx) => ctx.column === 'avatar' ? undefined : 'fs',
});
```

> **Runtime permissions.** On Deno, the runtime needs read and write access to
> `rootDir` (configure it in your `deno.jsonc` permissions, scoped to that
> directory). On Node 20+/Bun no configuration is needed. Filesystem access is
> feature-detected at call time (the package references no `Deno.*` symbol at
> module load), consistent with the rest of the runtime-agnostic codebase.

### Schema setup

Mark JSON columns with `.$cms({ file: true })`:

```typescript
file: jsonb('file').$cms({ file: true }),
// or with constraints:
avatar: jsonb('avatar').$cms({ file: { accept: 'image/*', maxSize: 2_000_000 } }),
```

Because keys embed the record id (`{table}/{column}/{recordId}/{uuid}-{file}`),
the upload UI shows a _"Save this record first"_ hint on the create screen for
tables without `$cms({ autoDraft: true })` — identical to the S3 plugin.

## Configuration options

| Option           | Type                | Description                                                                        |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `basePath`       | `string`            | Base path of the CMS admin (e.g. `/admin`). Required.                              |
| `rootDir`        | `string`            | Directory on disk where files are stored. Required (unless `fs` provided).         |
| `signingSecret`  | `string`            | HMAC secret for upload/download tokens (≥16 chars). Defaults to `CMS_CSRF_SECRET`. |
| `storageId`      | `string`            | Storage provider id (default `'fs'`).                                              |
| `publicBaseUrl`  | `string`            | Serve files from a static server/CDN at this URL instead of the plugin.            |
| `expirySeconds`  | `number`            | Token / redirect expiry (default `900`).                                           |
| `maxUploadBytes` | `number`            | Upload route body cap. Raw byte cap (default `11MB`).                              |
| `fs`             | `FileSystemAdapter` | Custom backend. Defaults to a disk adapter rooted at `rootDir`.                    |

## Serving with nginx / caddy

The on-disk layout is predictable:

```
{rootDir}/{table}/{column}/{recordId}/{uuid}-{filename}
```

You can let a static file server deliver bytes to visitors and point the plugin
at it with `publicBaseUrl`:

```nginx
# nginx: serve the uploads directory at /files/
location /files/ {
    alias /srv/app/uploads/;
    # Force download; never execute scriptable uploads (e.g. SVG/HTML) inline.
    add_header Content-Disposition "attachment" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

```caddy
# Caddy
handle_path /files/* {
    root * /srv/app/uploads
    header Content-Disposition attachment
    header X-Content-Type-Options nosniff
    file_server
}
```

```typescript
createFsStoragePlugin({
  basePath: '/admin',
  rootDir: '/srv/app/uploads',
  publicBaseUrl: 'https://example.com/files',
  signingSecret: process.env.CMS_CSRF_SECRET!,
});
```

> ⚠️ **Security caveat — a raw static mount bypasses CMS policies.** The CMS
> `/files/` route enforces your row and column **policies** before serving a
> file; a bare nginx/caddy mount does **not**. Only set `publicBaseUrl` for
> content that is safe to expose publicly. For policy-protected files, leave it
> unset and let the plugin's token-signed `_serve` route deliver the bytes.

## Custom backends & testing

`fs` accepts any `FileSystemAdapter`:

```typescript
interface FileSystemAdapter {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(
    prefix: string,
  ): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
}
```

`createMemoryFsAdapter()` provides an in-memory implementation (used by this
plugin's own tests so they never touch disk).

## Security notes

- **Path traversal** — every key is validated by `assertSafeKey()` before it
  maps to a disk path: absolute paths, backslashes, `.`/`..` segments, and
  control characters are rejected. This is in addition to core's
  `isValidFileKey()` prefix check.
- **Unauthenticated writes** — the `_upload` route is not a generic
  write-to-disk endpoint: it requires an admin session, a valid CSRF token, and
  a short-lived signed token that binds the exact key, size, content type, and
  target record (table/column/record id). The upload is rejected (`415`) if its
  `Content-Type` doesn't match the token.
- **Atomic writes** — the disk adapter stages each upload in a sibling
  `.uploads-tmp/` directory and renames it into place, so a half-written file is
  never visible under its final key. A temp orphaned by a hard crash mid-write
  is reclaimed by an age-based sweep on a later upload (anything older than an
  hour); abandoned _completed_ uploads are reclaimed by the CMS orphan-cleanup
  (same as the S3 backend).
- **Scriptable content** — the `_serve` route always responds with
  `attachment` + `nosniff` + a strict CSP, so SVG/HTML uploads can't execute if
  opened directly.
