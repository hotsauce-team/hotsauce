// File storage abstraction
// Provides pluggable storage backends (local filesystem, S3, etc.)

/**
 * Metadata about an uploaded file
 */
export interface UploadedFile {
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
}

/**
 * Options for storing a file
 */
export interface StoreFileOptions {
  filename?: string;
  directory?: string;
}

/**
 * Storage backend interface
 */
export interface StorageBackend {
  store(file: File, options?: StoreFileOptions): Promise<UploadedFile>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  getUrl(path: string): string;
}

/**
 * Bundled storage plugin result
 * Contains a storage backend and optional static file handler
 */
export interface StoragePlugin {
  /** Storage backend for the CMS handler */
  storage: StorageBackend;
  /** Static file handler for serving uploads (returns null if not matched) */
  handler: (request: Request) => Promise<Response | null>;
}

/**
 * Generate a unique filename to avoid collisions
 */
export function generateUniqueFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const ext = originalFilename.includes('.') 
    ? '.' + originalFilename.split('.').pop() 
    : '';
  const baseName = originalFilename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50);
  return `${baseName}_${timestamp}_${random}${ext}`;
}

/**
 * Sanitize a path to prevent directory traversal attacks
 */
export function sanitizePath(path: string): string {
  return path
    .replace(/\.\./g, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * Check if a file type is allowed based on MIME type patterns
 */
export function isAllowedMimeType(mimeType: string, allowed: string[]): boolean {
  for (const pattern of allowed) {
    if (pattern === '*' || pattern === '*/*') return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      if (mimeType.startsWith(prefix)) return true;
    } else if (pattern === mimeType) {
      return true;
    }
  }
  return false;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
