# @hotsauce/plugins/s3-storage

S3-compatible storage plugin for HotSauce CMS. Enables direct browser-to-S3 uploads using presigned URLs, keeping large files off your server.

## Features

- **Direct uploads** — Files go straight from browser to S3 (no server bottleneck)
- **Presigned URLs** — Secure, time-limited upload/download URLs using AWS Signature V4
- **Policy-aware downloads** — Respects row/column policies for file access control
- **Multi-provider** — Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces
- **Zero dependencies** — Pure Web Crypto API implementation (no AWS SDK)

## Installation

```ts
import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';
```

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

const handler = createCmsHandler({
  db,
  schema,
  plugins: [s3Plugin],
  storage: {
    defaultObjectStorageId: 's3', // Route file fields to this plugin
  },
});
```

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
2. CMS generates presigned PUT URL (valid for 1 hour)
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

- **Create view**: Shows "Save record first to upload files via S3" (no file input)
- **Edit view**: Shows "Upload via S3" link

This is because S3 upload paths include the record ID, which doesn't exist until after creation.

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
photo: jsonb('photo').$cms({ file: true, maxSize: 50 * 1024 * 1024, accept: 'image/*' }),

// Unlimited size (opt out of default)
video: jsonb('video').$cms({ file: true, maxSize: 0 }),

// Multiple accepted types
document: jsonb('document').$cms({ file: true, accept: 'image/*,application/pdf' }),
```

| `$cms()` option | Type     | Default  | Description                                        |
| --------------- | -------- | -------- | -------------------------------------------------- |
| `maxSize`       | `number` | 10MB     | Max file size in bytes. `0` = unlimited.           |
| `accept`        | `string` | _(none)_ | MIME pattern(s): `image/*`, `image/png,image/jpeg` |

The upload page shows hints ("Max size: 10MB") and sets the `accept` attribute on the file input for OS-level filtering.

> **Note:** The core CMS defaults (`200KB`, `image/*`) apply to built-in database-stored files.
> The S3 plugin uses its own 10MB default since object storage is designed for larger files.

### Presigned URLs

- Time-limited (default: 15 minutes)
- Scoped to specific object key
- Use AWS Signature V4 (HMAC-SHA256)

> **Note:** Content-Type is intentionally NOT included in the signature. This avoids
> MinIO/CORS issues with unsigned headers. The browser sets Content-Type from the file.

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
storage: {
  defaultObjectStorageId: 's3',
  resolveStorage: ({ table, column, user }) => {
    // Large files to cheap storage
    if (table === 'videos') return 'glacier';
    // Tenant isolation
    if (user?.tenantId) return `tenant-${user.tenantId}`;
    return 's3';
  },
}
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

## Troubleshooting

### "Upload via S3" link doesn't appear

1. Ensure `storage.defaultObjectStorageId` matches the plugin's `storageId`
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

Default expiry is 1 hour. Increase with `urlExpiry` option (in seconds).
