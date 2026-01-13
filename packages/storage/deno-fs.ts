// Deno filesystem storage implementation
// Uses Deno-specific APIs (Deno.writeFile, Deno.remove, Deno.stat, etc.)

import type { StorageBackend, StoragePlugin, UploadedFile, StoreFileOptions } from './storage.ts';
import { generateUniqueFilename, sanitizePath } from './storage.ts';
import { getContentType } from './utils.ts';

/**
 * Options for local uploads plugin
 */
export interface LocalUploadsOptions {
  /** 
   * Root directory for file storage (absolute or relative path)
   * Files will be stored under this directory
   */
  directory: string;
  /** 
   * URL prefix for serving files (e.g., '/uploads')
   * Used to generate public URLs and match incoming requests
   */
  urlPrefix: string;
}

/**
 * Create a local uploads plugin for Deno
 * 
 * Bundles together the storage backend and static file handler
 * with a single configuration.
 * 
 * @example
 * ```ts
 * import { createLocalUploads } from '@drizzle-cms/storage/deno-fs';
 * 
 * const uploads = createLocalUploads({
 *   directory: './uploads',
 *   urlPrefix: '/uploads',
 * });
 * 
 * const cmsHandler = createCmsHandler({
 *   db,
 *   schema,
 *   storage: uploads.storage,
 * });
 * 
 * Deno.serve(async (request) => {
 *   // Serve uploaded files
 *   const staticResponse = await uploads.handler(request);
 *   if (staticResponse) return staticResponse;
 *   
 *   // Handle CMS routes
 *   return cmsHandler(request);
 * });
 * ```
 */
export function createLocalUploads(options: LocalUploadsOptions): StoragePlugin {
  const { directory, urlPrefix } = options;
  
  return {
    storage: createLocalStorage({ directory, baseUrl: urlPrefix }),
    handler: createStaticHandler({ directory, urlPrefix }),
  };
}

// ─────────────────────────────────────────────────────────────
// Individual components (exported for advanced use)
// ─────────────────────────────────────────────────────────────

interface LocalStorageOptions {
  directory: string;
  baseUrl: string;
}

/**
 * Create a local filesystem storage backend for Deno
 * 
 * @example
 * ```ts
 * const storage = createLocalStorage({
 *   directory: './uploads',
 *   baseUrl: '/uploads',
 * });
 * ```
 */
export function createLocalStorage(options: LocalStorageOptions): StorageBackend {
  const { directory, baseUrl } = options;
  
  // Normalize baseUrl - remove trailing slash
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  
  return {
    async store(file: File, storeOptions?: StoreFileOptions): Promise<UploadedFile> {
      // Generate unique filename
      const originalFilename = storeOptions?.filename ?? file.name;
      const uniqueFilename = generateUniqueFilename(originalFilename);
      
      // Build storage path
      const subdir = storeOptions?.directory 
        ? sanitizePath(storeOptions.directory) 
        : '';
      const relativePath = subdir 
        ? `${subdir}/${uniqueFilename}` 
        : uniqueFilename;
      const absolutePath = `${directory}/${relativePath}`;
      
      // Ensure directory exists
      const dirPath = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
      await ensureDir(dirPath);
      
      // Write file
      const arrayBuffer = await file.arrayBuffer();
      await Deno.writeFile(absolutePath, new Uint8Array(arrayBuffer));
      
      return {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        path: relativePath,
        url: `${normalizedBaseUrl}/${relativePath}`,
      };
    },
    
    async delete(path: string): Promise<void> {
      const sanitized = sanitizePath(path);
      const absolutePath = `${directory}/${sanitized}`;
      try {
        await Deno.remove(absolutePath);
      } catch (error) {
        // Ignore if file doesn't exist
        if (!(error instanceof Deno.errors.NotFound)) {
          throw error;
        }
      }
    },
    
    async exists(path: string): Promise<boolean> {
      const sanitized = sanitizePath(path);
      const absolutePath = `${directory}/${sanitized}`;
      try {
        await Deno.stat(absolutePath);
        return true;
      } catch {
        return false;
      }
    },
    
    getUrl(path: string): string {
      const sanitized = sanitizePath(path);
      return `${normalizedBaseUrl}/${sanitized}`;
    },
  };
}

/**
 * Ensure a directory exists (create if needed)
 */
async function ensureDir(path: string): Promise<void> {
  try {
    await Deno.mkdir(path, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

/**
 * Serve static files from a directory
 * Returns a handler that serves files or null if not matched
 * 
 * @example
 * ```ts
 * const serveUploads = createStaticHandler({
 *   directory: './uploads',
 *   urlPrefix: '/uploads',
 * });
 * 
 * Deno.serve(async (request) => {
 *   const staticResponse = await serveUploads(request);
 *   if (staticResponse) return staticResponse;
 *   return new Response('Not Found', { status: 404 });
 * });
 * ```
 */
export function createStaticHandler(options: {
  directory: string;
  urlPrefix: string;
}): (request: Request) => Promise<Response | null> {
  const { directory, urlPrefix } = options;
  const prefix = urlPrefix.replace(/\/+$/, '');
  
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    
    // Check if this request is for our prefix
    if (!url.pathname.startsWith(prefix + '/')) {
      return null;
    }
    
    // Get the file path
    const relativePath = sanitizePath(url.pathname.slice(prefix.length + 1));
    const absolutePath = `${directory}/${relativePath}`;
    
    try {
      const file = await Deno.open(absolutePath, { read: true });
      const stat = await file.stat();
      
      if (!stat.isFile) {
        file.close();
        return null;
      }
      
      // Guess content type from extension
      const contentType = getContentType(relativePath);
      
      return new Response(file.readable, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Cache-Control': 'public, max-age=31536000', // 1 year for immutable files
        },
      });
    } catch {
      return null;
    }
  };
}
