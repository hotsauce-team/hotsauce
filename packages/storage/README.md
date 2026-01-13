# @drizzle-cms/storage

Storage abstraction for drizzle-cms. Provides pluggable storage backends for file uploads.

## Installation

```ts
import { 
  type StorageBackend,
  type UploadedFile,
  generateUniqueFilename,
  sanitizePath,
  isAllowedMimeType,
  formatFileSize,
} from '@drizzle-cms/storage';
```

## StorageBackend Interface

Implement this interface to create custom storage backends (local filesystem, S3, GCS, etc.):

```ts
interface StorageBackend {
  store(file: File, options?: StoreFileOptions): Promise<UploadedFile>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): string;
}
```

## Utility Functions

### `generateUniqueFilename(originalFilename: string): string`

Generates a unique filename using timestamp + random string to avoid collisions.

### `sanitizePath(path: string): string`

Sanitizes a path to prevent directory traversal attacks.

### `isAllowedMimeType(mimeType: string, allowed: string[]): boolean`

Checks if a MIME type matches allowed patterns (supports wildcards like `image/*`).

### `formatFileSize(bytes: number): string`

Formats file size for human-readable display (e.g., "1.5 MB").

### `getFileExtension(filename: string): string`

Extracts the file extension from a filename.

## Example Implementation

See `examples/deno-server/storage.ts` for a complete Deno filesystem implementation.
