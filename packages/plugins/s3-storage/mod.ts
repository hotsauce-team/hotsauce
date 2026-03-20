/**
 * S3 Storage Plugin for HotSauce CMS
 *
 * Provides presigned upload URLs for direct browser-to-S3 uploads,
 * and signed download URLs for policy-aware file serving.
 *
 * Works with any S3-compatible storage: AWS S3, MinIO, Cloudflare R2,
 * Backblaze B2, DigitalOcean Spaces, and more.
 *
 * @example
 * ```ts
 * import { createS3StoragePlugin } from '@hotsauce/plugins/s3-storage';
 *
 * const handler = createCmsHandler({
 *   db, schema,
 *   plugins: [
 *     createS3StoragePlugin({
 *       basePath: '/admin',
 *       endpoint: 'https://s3.us-east-1.amazonaws.com',
 *       region: 'us-east-1',
 *       bucket: 'my-uploads',
 *       accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *       secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *     }),
 *   ],
 *   storage: {
 *     defaultObjectStorageId: 's3',
 *   },
 * });
 * ```
 *
 * @module
 */

import type { InProcessPluginConfig } from '@hotsauce/cms';
import type { ResolvedS3Options, S3StoragePluginOptions } from './types.ts';
import type {
  DeleteContext,
  PresignContext,
  PresignResult,
  SignDownloadContext,
  StorageProvider,
} from '../../cms/types.ts';
import { getFileKeyPrefix } from '@hotsauce/core';
import { buildObjectUrl, presignUrl, signHeaders } from './sigv4.ts';

// Re-export types for convenience
export type { S3StoragePluginOptions } from './types.ts';

// ─────────────────────────────────────────────────────────────
// Unique Key Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generate a unique object key for uploads.
 *
 * Format: {table}/{column}/{recordId}/{uuid}-{filename}
 *
 * Every upload produces a globally unique key. Keys are NEVER reused.
 * This is a correctness requirement for:
 * - Backup safety (old objects remain addressable)
 * - Race condition avoidance
 * - CDN cache correctness
 * - Ransomware resilience
 */
function generateObjectKey(
  table: string,
  column: string,
  recordId: string,
  filename: string,
): string {
  const uuid = crypto.randomUUID();
  // Sanitize filename to be URL-safe
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Use shared prefix from core to ensure consistency with key validation
  return `${getFileKeyPrefix(table, column, recordId)}${uuid}-${safeFilename}`;
}

// ─────────────────────────────────────────────────────────────
// Storage Provider Implementation
// ─────────────────────────────────────────────────────────────

/**
 * Create the storage provider for the CMS registry.
 */
function createStorageProvider(options: ResolvedS3Options): StorageProvider {
  return {
    id: options.storageId,
    kind: 's3',

    /**
     * Generate a presigned PUT URL for direct upload.
     */
    async presignUpload(ctx: PresignContext): Promise<PresignResult> {
      const bucket = typeof options.bucket === 'function'
        ? options.bucket({
          request: ctx.request,
          user: ctx.user,
          table: ctx.table,
          column: ctx.column,
          action: ctx.action,
          recordId: ctx.recordId,
        })
        : options.bucket;

      // Generate unique key
      const key = generateObjectKey(
        ctx.table,
        ctx.column,
        ctx.recordId!,
        ctx.filename,
      );

      // Build the object URL using publicEndpoint (browser-facing)
      // This ensures the presigned URL is accessible from the browser
      const objectUrl = buildObjectUrl(
        options.publicEndpoint,
        bucket,
        key,
        options.urlStyle,
      );

      // Generate presigned PUT URL
      const presignedUrl = await presignUrl({
        method: 'PUT',
        url: objectUrl,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        expirySeconds: options.expirySeconds,
        // Note: contentType is NOT passed to presignUrl - MinIO rejects unsigned headers
        // The browser will naturally send Content-Type from the file
      });

      return {
        key,
        upload: {
          method: 'PUT',
          url: presignedUrl,
          // No headers - browser sets Content-Type from file automatically
          // Adding headers here causes MinIO to reject with "unsigned headers" error
        },
      };
    },

    /**
     * Generate a signed GET URL for downloads.
     */
    async signDownloadUrl(ctx: SignDownloadContext): Promise<string> {
      const bucket = typeof options.bucket === 'function'
        ? options.bucket({
          request: ctx.request ?? new Request('https://internal'),
          user: ctx.user ?? null,
          table: '', // Not available in download context
          column: '',
          action: 'read',
          recordId: undefined,
        })
        : options.bucket;

      // If CDN is configured, use it for download URLs
      if (options.cdnBaseUrl) {
        // CDN URLs don't need signing (CDN handles auth via origin)
        return `${options.cdnBaseUrl}/${ctx.key}`;
      }

      // Build object URL using publicEndpoint (browser-facing)
      const objectUrl = buildObjectUrl(
        options.publicEndpoint,
        bucket,
        ctx.key,
        options.urlStyle,
      );

      // Generate presigned GET URL
      return await presignUrl({
        method: 'GET',
        url: objectUrl,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        expirySeconds: options.expirySeconds,
      });
    },

    /**
     * Delete an object from storage.
     */
    async deleteObject(ctx: DeleteContext): Promise<void> {
      const bucket = typeof options.bucket === 'function'
        ? options.bucket({
          request: ctx.request ?? new Request('https://internal'),
          user: ctx.user ?? null,
          table: '',
          column: '',
          action: 'delete',
          recordId: undefined,
        })
        : options.bucket;

      const objectUrl = buildObjectUrl(
        options.endpoint,
        bucket,
        ctx.key,
        options.urlStyle,
      );

      // Sign the DELETE request
      const headers = await signHeaders({
        method: 'DELETE',
        url: objectUrl,
        region: options.region,
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      });

      // Execute the DELETE request
      const response = await fetch(objectUrl, {
        method: 'DELETE',
        headers,
      });

      // 204 No Content or 200 OK are both success
      // 404 is also okay (object already deleted)
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Failed to delete object: ${response.status} ${response.statusText}`,
        );
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Plugin Factory
// ─────────────────────────────────────────────────────────────

/**
 * Create an S3-compatible storage plugin for the CMS.
 *
 * This plugin provides:
 * - Presigned upload URLs for direct browser-to-S3 uploads
 * - Signed download URLs for policy-aware file serving
 * - Standalone upload page (no JS in CMS core pages)
 * - "Upload to S3" links on edit forms
 *
 * @param pluginOptions - Plugin configuration
 * @returns Plugin configuration to pass to createCmsHandler
 */
export function createS3StoragePlugin(
  pluginOptions: S3StoragePluginOptions,
): InProcessPluginConfig {
  // Resolve options with defaults
  const options: ResolvedS3Options = {
    storageId: pluginOptions.storageId ?? 's3',
    endpoint: pluginOptions.endpoint,
    publicEndpoint: pluginOptions.publicEndpoint ?? pluginOptions.endpoint,
    region: pluginOptions.region,
    bucket: pluginOptions.bucket,
    accessKeyId: pluginOptions.accessKeyId,
    secretAccessKey: pluginOptions.secretAccessKey,
    urlStyle: pluginOptions.urlStyle ?? 'virtual-hosted',
    expirySeconds: pluginOptions.expirySeconds ?? 900,
    cdnBaseUrl: pluginOptions.cdnBaseUrl,
    basePath: pluginOptions.basePath,
  };

  // Create storage provider
  const storageProvider = createStorageProvider(options);

  return {
    name: 's3-storage',
    description: 'S3-compatible storage for file uploads',
    storageProvider,

    filter: (ctx) => {
      // Allow UI hooks for file columns
      if (ctx.hookType === 'ui:renderField') return true;
      // Allow route handlers
      if (ctx.hookType === 'route') return true;
      return false;
    },

    hooks: {
      ui: {
        /**
         * Render file field UI for create, edit, and detail pages.
         * - Create: "Save record first" message (no file input - S3 needs recordId for path)
         * - Edit: "Upload to S3" link + file summary + image preview
         * - Detail: file summary + image preview (no upload link)
         */
        renderField: (ctx) => {
          // Only for file fields
          if (ctx.field.fieldType !== 'file') {
            return null;
          }

          // Only render if this field's storage matches this plugin's storageId
          // This respects resolveStorage callback for per-column routing
          if (ctx.storageId !== options.storageId) {
            return null;
          }

          // Create view: no recordId yet, can't generate S3 upload path
          // Show message instead of file input for consistency with edit view
          if (ctx.view === 'create' || !ctx.recordId) {
            return {
              valueSummary: 'Save record first to upload files via S3',
            };
          }

          // Detail view or edit view - proceed with normal rendering
          if (ctx.view !== 'edit' && ctx.view !== 'detail') {
            return null;
          }

          // Generate summary of current file and URL for download/preview
          let valueSummary = 'No file';
          let fileUrl: string | undefined;
          if (ctx.value && typeof ctx.value === 'object') {
            const file = ctx.value as {
              filename?: string;
              size?: number;
              storage?: string;
              contentType?: string;
              key?: string;
              data?: string;
            };
            if (file.filename) {
              const sizeKb = file.size ? Math.round(file.size / 1024) : 0;
              const storage = file.storage ?? (file.data ? 'db' : 's3');
              valueSummary = `${file.filename} (${sizeKb}KB, ${storage})`;

              // Generate URL for file preview/download
              // The /files/ endpoint handles both DB-stored (data) and S3 (key) files
              if (file.key || file.data) {
                fileUrl =
                  `${options.basePath}/files/${ctx.table}/${ctx.field.name}/${ctx.recordId}`;
              }
            }
          }

          // Detail view: no upload link, just summary and file URL
          if (ctx.view === 'detail') {
            return {
              valueSummary,
              ...(fileUrl && { fileUrl }),
            };
          }

          // Edit view: include upload link
          const href =
            `${options.basePath}/s3-storage/${ctx.table}/${ctx.recordId}/${ctx.field.name}`;

          return {
            link: { href, label: 'Upload via S3', target: '_blank' },
            valueSummary,
            ...(fileUrl && { fileUrl }),
          };
        },
      },
    },

    routes: [
      // Upload page (GET /admin/s3-storage/:table/:id/:column)
      {
        pattern: ':table/:id/:column',
        methods: ['GET'],
        handler: (ctx) => {
          const { table, id, column } = ctx.params;
          // Use publicEndpoint for CSP if available (browser-facing URL)
          const uploadEndpoint = options.publicEndpoint || options.endpoint;
          const s3Url = new URL(uploadEndpoint);
          const s3Origin = s3Url.origin; // e.g., http://localhost:9000

          // Build CSP for upload page (allows PUT to S3)
          const csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'", // Allow inline script for init
            "style-src 'self' 'unsafe-inline'", // Allow inline styles
            `connect-src 'self' ${s3Origin}`, // S3 for upload
            "img-src 'self' data:", // Preview
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; ');

          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Upload File - ${table}/${id}/${column}</title>
  <link rel="stylesheet" href="${options.basePath}/styles.css">
  <style>
    .upload-container { max-width: 600px; margin: 2rem auto; padding: 1rem; }
    .upload-area {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .upload-area:hover, .upload-area.dragover {
      border-color: #4a90d9;
      background: #f0f7ff;
    }
    .upload-area input[type="file"] { display: none; }
    .progress-bar {
      height: 20px;
      background: #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
      margin: 1rem 0;
      display: none;
    }
    .progress-bar .progress {
      height: 100%;
      background: #4a90d9;
      width: 0%;
      transition: width 0.2s;
    }
    .status { margin: 1rem 0; }
    .status.error { color: #d32f2f; }
    .status.success { color: #388e3c; }
    .file-info { margin: 1rem 0; padding: 1rem; background: #f5f5f5; border-radius: 4px; }
    .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-secondary { background: #ccc; color: #333; }
  </style>
</head>
<body>
  <div class="upload-container">
    <h1>Upload File</h1>
    <p>Table: <strong>${table}</strong> | Record: <strong>${id}</strong> | Column: <strong>${column}</strong></p>

    <div class="upload-area" id="uploadArea">
      <input type="file" id="fileInput">
      <p>Click or drag a file here to upload</p>
    </div>

    <div class="progress-bar" id="progressBar">
      <div class="progress" id="progress"></div>
    </div>

    <div class="status" id="status"></div>

    <div class="file-info" id="fileInfo" style="display: none;">
      <p><strong>File:</strong> <span id="fileName"></span></p>
      <p><strong>Size:</strong> <span id="fileSize"></span></p>
      <p><strong>Type:</strong> <span id="fileType"></span></p>
    </div>

    <p style="margin-top: 2rem;">
      <a href="${options.basePath}/${table}/${id}/edit" class="btn btn-secondary">← Back to record</a>
    </p>
  </div>

  <script>
    const config = {
      basePath: ${JSON.stringify(options.basePath)},
      table: ${JSON.stringify(table)},
      recordId: ${JSON.stringify(id)},
      column: ${JSON.stringify(column)},
      csrfToken: ${JSON.stringify(ctx.csrfToken)},
      sourceToken: ${JSON.stringify(ctx.sourceToken)},
    };

    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const progressBar = document.getElementById('progressBar');
    const progress = document.getElementById('progress');
    const status = document.getElementById('status');
    const fileInfo = document.getElementById('fileInfo');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        handleFile(fileInput.files[0]);
      }
    });

    async function handleFile(file) {
      // Show file info
      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileSize').textContent = Math.round(file.size / 1024) + ' KB';
      document.getElementById('fileType').textContent = file.type || 'application/octet-stream';
      fileInfo.style.display = 'block';

      status.textContent = 'Getting presigned URL...';
      status.className = 'status';
      progressBar.style.display = 'none';

      try {
        // Step 1: Get presigned URL (POST to same URL)
        const presignRes = await fetch(window.location.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': config.csrfToken,
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          }),
        });

        if (!presignRes.ok) {
          let errMsg = 'Failed to get presigned URL';
          try {
            const err = await presignRes.json();
            errMsg = err.error || errMsg;
          } catch { errMsg = 'Server error (' + presignRes.status + ')'; }
          throw new Error(errMsg);
        }

        const presignData = await presignRes.json();
        status.textContent = 'Uploading to storage...';
        progressBar.style.display = 'block';

        // Step 2: Upload to S3
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              progress.style.width = pct + '%';
            }
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              // Extract error message from S3/MinIO XML response
              let detail = xhr.responseText || '';
              const match = detail.match(/<Message>([^<]+)<\\/Message>/);
              if (match) detail = match[1];
              reject(new Error('Upload failed (' + xhr.status + '): ' + (detail || 'Unknown error')));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('Upload failed: Network error (check browser console)')));
          xhr.open(presignData.upload.method, presignData.upload.url);
          for (const [k, v] of Object.entries(presignData.upload.headers || {})) {
            xhr.setRequestHeader(k, v);
          }
          xhr.send(file);
        });

        status.textContent = 'Saving to record...';

        // Step 3: Save FileReference to record (POST to CMS edit endpoint like Puck)
        const fileReference = {
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          storage: presignData.storage,
          key: presignData.key,
        };
        const formData = new FormData();
        formData.append(config.column, JSON.stringify(fileReference));
        formData.append('_csrf', config.csrfToken);
        formData.append('_source', config.sourceToken);

        const saveRes = await fetch(config.basePath + '/' + config.table + '/' + config.recordId, {
          method: 'POST',
          body: formData,
        });

        if (!saveRes.ok) {
          const errText = await saveRes.text();
          throw new Error('Failed to save: ' + saveRes.status + ' ' + errText.slice(0, 100));
        }

        status.textContent = 'Upload complete! Redirecting...';
        status.className = 'status success';

        // Redirect back to the edit page
        setTimeout(() => {
          window.location.href = config.basePath + '/' + config.table + '/' + config.recordId + '/edit';
        }, 1000);

      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.className = 'status error';
        progressBar.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;

          return new Response(html, {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          });
        },
      },
      // Presign endpoint (POST /admin/s3-storage/:table/:id/:column)
      // Same URL as upload page, different method - CMS handles policy checks
      {
        pattern: ':table/:id/:column',
        methods: ['POST'],
        handler: async (ctx) => {
          const { table, id, column } = ctx.params;

          // Request body should be JSON with file info only
          // (table/id/column come from URL params, which CMS has policy-checked)
          let body: {
            filename: string;
            contentType: string;
            size: number;
          };

          try {
            if (!ctx.body) {
              throw new Error('No request body');
            }
            body = JSON.parse(ctx.body);
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid JSON body' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          // Validate required fields (use explicit checks for size since 0 is valid)
          if (
            !body.filename ||
            !body.contentType ||
            typeof body.size !== 'number'
          ) {
            return new Response(
              JSON.stringify({ error: 'Missing required fields' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }

          // Generate presigned upload URL
          const presignResult = await storageProvider.presignUpload!({
            request: new Request(ctx.requestUrl),
            user: ctx.user ?? null,
            table,
            column,
            action: 'update',
            recordId: id,
            filename: body.filename,
            contentType: body.contentType,
            size: body.size,
          });

          return new Response(
            JSON.stringify({
              storage: options.storageId,
              key: presignResult.key,
              upload: presignResult.upload,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      },
    ],
  };
}
