# @hotsauce/plugins/s3-storage

S3-compatible storage plugin for HotSauce CMS. Enables direct browser-to-S3 uploads using presigned URLs, keeping large files off your server.

## Features

- **Direct uploads** — Files go straight from browser to S3 (no server bottleneck)
- **Presigned URLs** — Secure, time-limited upload/download URLs using AWS Signature V4
- **Policy-aware downloads** — Respects row/column policies for file access control
- **Multi-provider** — Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces
- **Zero dependencies** — Pure Web Crypto API implementation (no AWS SDK)

## Installation

**Deno / JSR** — the plugin ships as part of the `@hotsauce/plugins` package:

```bash
deno add jsr:@hotsauce/plugins
```

```ts
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';
```

**Node / npm** — published standalone as
[`@hotsauce/plugins-s3-storage`](https://www.npmjs.com/package/@hotsauce/plugins-s3-storage)
(note the different import specifier):

```bash
npm install @hotsauce/plugins-s3-storage
```

```ts
import { createS3StoragePlugin } from '@hotsauce/plugins-s3-storage';
```

Sub-exports follow the same shape on both registries: types at
`@hotsauce/plugins/s3-storage/types` (JSR) /
`@hotsauce/plugins-s3-storage/types` (npm), and the standalone SigV4 signing
utilities at `.../signing`.

## Basic Usage

```ts
import { createCmsHandler } from '@hotsauce/cms';
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';

const s3Plugin = createS3StoragePlugin({
  basePath: '/admin',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'my-uploads',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

const s3Endpoint = 'https://s3.us-east-1.amazonaws.com';

const handler = createCmsHandler({
  db,
  schema,
  plugins: [s3Plugin],
  storage: 's3', // Route file fields to this plugin
  // Allow S3 images on CMS edit/detail pages
  csp: { imgSrc: [s3Endpoint] },
});
```

The plugin automatically configures `connectSrc` for its upload page via route-level CSP — no global `connectSrc` needed. Add `imgSrc` if you display S3-hosted images on CMS pages (previews on edit/detail views).

## Configuration Options

| Option            | Type                 | Required | Description                                            |
| ----------------- | -------------------- | -------- | ------------------------------------------------------ |
| `basePath`        | `string`             | Yes      | CMS base path (e.g., `/admin`)                         |
| `endpoint`        | `string`             | Yes      | S3 endpoint URL                                        |
| `region`          | `string`             | Yes      | AWS region (e.g., `us-east-1`)                         |
| `bucket`          | `string \| Function` | Yes      | Bucket name or function for dynamic routing            |
| `accessKeyId`     | `string`             | Yes      | AWS access key                                         |
| `secretAccessKey` | `string`             | Yes      | AWS secret key                                         |
| `storageId`       | `string`             | No       | Storage ID (default: `'s3'`)                           |
| `publicEndpoint`  | `string`             | No       | Browser-facing endpoint (if different from `endpoint`) |
| `expirySeconds`   | `number`             | No       | Presigned URL expiry in seconds (default: `900`)       |

## Local Development with MinIO

MinIO provides S3-compatible storage for local development:

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000' # S3 API
      - '9001:9001' # Web console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
```

```ts
// For Docker (server talks to minio:9000, browser talks to localhost:9000)
createS3StoragePlugin({
  basePath: '/admin',
  endpoint: 'http://minio:9000', // Server-side (Docker internal)
  publicEndpoint: 'http://localhost:9000', // Browser-side
  region: 'us-east-1',
  bucket: 'uploads',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
});
```

Create the bucket via MinIO console at `http://localhost:9001` or CLI:

```bash
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/uploads
```

## How It Works

### Upload Flow

1. User clicks "Upload via S3" on edit page
2. CMS generates presigned PUT URL (valid for 15 minutes by default)
3. Browser uploads directly to S3
4. On success, CMS updates record with file metadata

```
Browser → CMS: "I want to upload image.jpg"
CMS → Browser: Presigned URL + form fields
Browser → S3: PUT file directly
Browser → CMS: "Upload complete"
CMS → DB: Update record with file info
```

### Download Flow

1. User/frontend requests file via CMS endpoint
2. CMS checks row/column policies
3. If allowed, generates presigned GET URL
4. Redirects browser to S3

### Create vs Edit

S3 uploads need a record ID to build the object key (`{table}/{column}/{recordId}/...`). On the **edit** page the ID already exists, so uploads work immediately.

On the **create** page there's no ID yet. The CMS handles this with the `autoDraft` table option:

- **`$cms({ autoDraft: true })`** — When visiting "Create New", the CMS inserts a row with all defaults and redirects to the edit page, where uploads work immediately.
- **Without `autoDraft`** — The standard create form appears. File upload fields show "Save this record first to enable S3 uploads."

`autoDraft` requires every non-PK column to have a default or be nullable — the CMS validates this at startup and throws a clear error if the schema doesn't support it.

> **Recommendation:** Add `$cms({ autoDraft: true })` to tables with file uploads, and
> design those tables so all required columns have sensible defaults.
> See [Schema Design for Create-Time Uploads](#schema-design-for-create-time-uploads) below.

## Object Key Format

Files are stored with unique keys that are never reused:

```
{table}/{column}/{recordId}/{uuid}-{filename}
```

Example: `media/file/123/a1b2c3d4-photo.jpg`

This ensures:

- Backups remain valid (old keys addressable)
- No race conditions on concurrent uploads
- CDN caches stay correct
- Ransomware resilience (can't overwrite existing files)

## Security

### File Validation

The plugin validates file size and content type **before** generating a presigned URL. Validation is enforced server-side (the real security boundary) and also client-side for instant feedback.

**Default limit: 10MB.** All S3 file uploads are capped at 10MB unless you set an explicit `maxSize` in `$cms()`.

```ts
// Default: 10MB limit, no type restriction
file: jsonb('file').$cms({ file: true }),

// Custom: 50MB limit, images only
photo: jsonb('photo').$cms({ file: { maxSize: 50 * 1024 * 1024, accept: 'image/*' } }),

// Unlimited size (opt out of default)
video: jsonb('video').$cms({ file: { maxSize: 0 } }),

// Multiple accepted types
document: jsonb('document').$cms({ file: { accept: 'image/*,application/pdf' } }),
```

| `$cms().file` option | Type     | Default  | Description                                        |
| -------------------- | -------- | -------- | -------------------------------------------------- |
| `maxSize`            | `number` | 10MB     | Max file size in bytes. `0` = unlimited.           |
| `accept`             | `string` | _(none)_ | MIME pattern(s): `image/*`, `image/png,image/jpeg` |

The upload page shows hints ("Max size: 10MB") and sets the `accept` attribute on the file input for OS-level filtering.

> **Note:** The core CMS defaults (`200KB`, `image/*`) apply to built-in database-stored files.
> The S3 plugin uses its own 10MB default since object storage is designed for larger files.

### Presigned URLs

- Time-limited (default: 15 minutes)
- Scoped to specific object key
- Use AWS Signature V4 (HMAC-SHA256)
- Sign `Content-Length` and `Content-Type` headers

#### What's Enforced

The presigned URL binds the exact `Content-Length` and `Content-Type` that the client must send. S3/MinIO will reject uploads where these headers don't match exactly (typically `SignatureDoesNotMatch`).

**This prevents:**

- "Presign small, upload big" attacks — client can't claim a small file then upload a large one
- Content-Type spoofing at the header level — the declared type must match what was signed

#### What's NOT Enforced

The signature does **not** validate that the uploaded bytes actually match the declared MIME type. A client can upload arbitrary bytes while sending the signed Content-Type header.

**Example:** A presigned URL for `image/png` will accept any bytes as long as the client sends `Content-Type: image/png` in the request headers.

**If you need byte-level validation:**

- Implement a post-upload content sniffing step (Lambda/edge function)
- Use S3 Object Lambda to validate on read
- Run antivirus scanning on uploaded objects

#### Compatibility Note

Signing `Content-Length` and `Content-Type` increases coupling to client/browser behavior. Some scenarios may cause signature mismatches:

- Streaming/chunked uploads (no Content-Length)
- Intermediaries that normalize headers
- Certain S3-compatible vendors with different header handling

If you encounter issues, check that the client sends these headers exactly as returned from the presign endpoint.

### SVG and Scriptable Files

When the CMS serves a file from its own database (`/admin/files/...` with inline data), it forces `Content-Disposition: attachment` and a strict CSP for SVGs, preventing them from executing scripts in the browser.

**S3-stored files are served directly by S3**, not through the CMS. The 302 redirect sends the browser straight to S3, so S3's response headers determine how the browser treats the file. By default, most S3-compatible providers serve files with the content type they were uploaded with. A browser that opens an `image/svg+xml` presigned URL directly will render it as a document, and any `<script>` in the SVG will execute.

**Recommended mitigation — bucket-level response headers:**

Configure your bucket to override the content type for SVG responses:

```json
// AWS S3 — set via Object Metadata or S3 Object Lambda
// R2 / MinIO — configure bucket response header overrides
{
  "Content-Disposition": "attachment",
  "Content-Type": "application/octet-stream"
}
```

Or restrict what content types your upload validation accepts:

```ts
// Reject SVG at upload time if your use case doesn't require it
avatar: jsonb('avatar').$cms({
  file: { accept: 'image/png,image/jpeg,image/webp,image/gif' },
}),
```

The `accept` restriction is enforced server-side before the presigned URL is generated, so SVGs are rejected before they reach S3.

### Policy Integration

Downloads respect CMS row/column policies:

```ts
// User can only download files from their own records
policies: {
  media: ownedBy(schema.media, 'userId'),
}
```

### CORS Configuration

Configure your S3 bucket to allow browser uploads:

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://your-cms-domain.com"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }]
}
```

## Multi-Storage Routing

Route different tables/columns to different storage backends:

```ts
const handler = createCmsHandler({
  db,
  schema,
  plugins: [s3Plugin, glacierPlugin],
  storage: ({ table, column, user }) => {
    // Large files to cheap storage
    if (table === 'videos') return 'glacier';
    // Tenant isolation
    if (user?.tenantId) return `tenant-${user.tenantId}`;
    return 's3';
  },
});
```

## File Metadata Schema

The plugin stores file metadata in your database column as JSON:

```ts
{
  filename: string; // Original filename
  size: number; // Bytes
  contentType: string; // MIME type
  key: string; // S3 object key
  storage: string; // Storage provider ID ('s3')
  uploadedAt: string; // ISO timestamp
}
```

Define your schema column as JSON/JSONB:

```ts
// Postgres
file: jsonb('file').$cms({ file: true }),

// SQLite
file: text('file', { mode: 'json' }).$cms({ file: true }),
```

## Schema Design for Create-Time Uploads

Tables with `$cms({ autoDraft: true })` get automatic draft row creation. Every non-PK column must either have a **database default** or be **nullable** — the CMS validates this at startup.

### Good: Draft-capable schemas

```ts
import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ✅ All columns have defaults or are nullable
export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  file: jsonb('file'), // nullable — OK
  alt: text('alt'), // nullable — OK
  published: boolean('published').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}).$cms({ autoDraft: true });

// ✅ Works with serial PKs too — PK type doesn't matter
export const uploads = pgTable('uploads', {
  id: serial('id').primaryKey(),
  file: jsonb('file'), // nullable — OK
  description: text('description'), // nullable — OK
  status: text('status').default('draft'), // has default — OK
}).$cms({ autoDraft: true });
```

### Bad: Blocks auto-draft

```ts
// ❌ title is NOT NULL with no default — CMS can't insert an empty row
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(), // ← blocks auto-draft
  body: text('body'),
  cover: jsonb('cover').$cms({ file: true }),
});
```

Fix: add a default, or make the column nullable:

```ts
// Option A: default value
title: text('title').notNull().default('Untitled'),

// Option B: nullable (let users fill it in after creating)
title: text('title'),
```

### Common patterns

```ts
// Published flag — use default(false) so drafts start unpublished
published: boolean('published').notNull().default(false),

// Status enum — default to 'draft'
status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),

// Timestamps — use defaultNow()
createdAt: timestamp('created_at').notNull().defaultNow(),

// Author — nullable if set later, or use a policy default
authorId: uuid('author_id'),

// Slug — $defaultFn generates a unique value for each draft
slug: varchar('slug', { length: 255 }).unique()
  .$defaultFn(() => `draft-${crypto.randomUUID().slice(0, 8)}`),
```

**Tip:** If you make columns nullable for `autoDraft` but want to enforce them on publish, use a [custom parser](../../cms/README.md) with Zod `superRefine`:

```ts
const pagesSchema = createInsertSchema(pages).superRefine((data, ctx) => {
  if (data.published && !data.title) {
    ctx.addIssue({
      code: 'custom',
      message: 'Title is required when publishing',
      path: ['title'],
    });
  }
});
```

### How it works

When a user clicks "Create New" on a table with `$cms({ autoDraft: true })`:

1. CMS inserts a row with all defaults (`INSERT … DEFAULT VALUES RETURNING *`)
2. Redirects to the edit page for that new row
3. User can upload files and fill in fields, then save

For tables without `autoDraft`, the standard create form appears. File upload fields show "Save this record first to enable S3 uploads."

## Troubleshooting

### "Upload via S3" link doesn't appear

1. Ensure `storage` is set to the plugin's `storageId` (default: `'s3'`)
2. Check the column has `$cms({ file: true })` marker
3. Verify the plugin is in the `plugins` array

### CORS errors

Configure bucket CORS to allow your CMS domain. For MinIO:

```bash
mc admin config set local cors <<EOF
{
  "cors": [{
    "origin": ["http://localhost:3000"],
    "method": ["PUT", "GET"],
    "header": ["*"]
  }]
}
EOF
```

### Presigned URL expired

Default expiry is 15 minutes. Increase with `expirySeconds` option.

## Future / Not Yet Implemented

- **Orphan GC** — Uploaded files that never get attached to a record (e.g., user
  starts upload then abandons the form) accumulate in storage. A cleanup mechanism
  is needed.
- **Frontend URL signing** — Expose `signDownloadUrl` for use outside the CMS
  handler context (e.g., public site templates, API routes).
- **In-form upload** — Upload files without leaving the edit page. Currently
  redirects to a standalone upload page; inline upload would improve UX.
- **Media library UI** — Browse/select from previously uploaded files instead of
  uploading new ones each time. Separate milestone.
- **CDN integration docs** — Example CloudFront / Cloudflare R2 CDN configuration
  with cache invalidation.
- **IAM role credentials** — Support EC2/ECS instance profiles (IMDS v2) instead
  of long-lived access keys in environment variables.
- **Additional S3 providers** — Tested with MinIO. AWS S3, Backblaze B2, and
  Hetzner Object Storage to be verified.
