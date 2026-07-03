// Response helpers and form parsing utilities

import type { IntrospectedColumn } from '@hotsauce/core';
import {
  FILE_DEFAULT_ACCEPT,
  FILE_DEFAULT_MAX_SIZE,
  type FileReference,
} from '@hotsauce/core';
import { escapeHtml } from '@hotsauce/ui';
import { typeByExtension } from '@std/media-types';
import type { CspOptions } from './types.ts';

/**
 * Security headers for HTML responses
 *
 * These headers enable strict Content Security Policy and other protections:
 * - CSP: Restricts resources to same-origin, enabling strict style-src
 * - X-Content-Type-Options: Prevents MIME sniffing
 * - X-Frame-Options: Prevents clickjacking
 * - Referrer-Policy: Limits referrer information leakage
 * - Permissions-Policy: Denies browser feature access (camera, mic, geolocation, etc.)
 */

/**
 * Build security headers with optional CSP extensions.
 * Called once at startup; the result is reused for every response.
 */
export function buildSecurityHeaders(
  csp?: CspOptions,
): Record<string, string> {
  const imgSrc = `img-src 'self' data:${joinCspValues(csp?.imgSrc)}`;
  const connectSrc = csp?.connectSrc?.length
    ? `connect-src 'self'${joinCspValues(csp.connectSrc)}; `
    : '';
  const frameSrc = csp?.frameSrc?.length
    ? `frame-src 'self'${joinCspValues(csp.frameSrc)}; `
    : '';
  const styleSrc = `style-src 'self'${joinCspValues(csp?.styleSrc)}`;

  return {
    'Content-Security-Policy':
      `default-src 'self'; ${styleSrc}; script-src 'self'; ${connectSrc}${frameSrc}${imgSrc}; form-action 'self'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), xr-spatial-tracking=()',
  };
}

/**
 * Normalize a CSP source value.
 * URL sources are reduced to the origin (scheme + host + port).
 * Non-URL values (keywords like 'unsafe-inline', hashes, nonces) are returned as-is.
 */
function normalizeCspValue(source: string): string {
  try {
    const url = new URL(source);
    return url.origin;
  } catch {
    return source;
  }
}

function joinCspValues(sources?: string[]): string {
  if (!sources?.length) return '';
  return ' ' + sources.map(normalizeCspValue).join(' ');
}

/** Default security headers (no CSP extensions) */
export const SECURITY_HEADERS: Record<string, string> = buildSecurityHeaders();

/**
 * Ensure `frame-ancestors 'self'` is present in the response headers.
 *
 * Extracts any existing `frame-ancestors` directive and extends its source
 * list with `'self'`. If no directive exists, one is appended. If the CSP
 * header is absent entirely, a minimal header with `frame-ancestors 'self'`
 * is added. This is unconditional — operator-supplied CSP that omits the
 * directive still gets framing protection.
 *
 * Special case: `'none'` means "block all" and is invalid combined with other
 * sources, so it is replaced entirely rather than extended.
 */
export function addFrameAncestorSelf(headers: Record<string, string>): void {
  const csp = headers['Content-Security-Policy'];
  if (!csp) {
    headers['Content-Security-Policy'] = "frame-ancestors 'self'";
    return;
  }
  const m = csp.match(/frame-ancestors([^;]*)(;|$)/);
  if (m) {
    const existing = (m[1] ?? '').trim();
    // 'none' means "block all" — combining it with 'self' is invalid per spec,
    // so replace it entirely rather than producing "frame-ancestors 'none' 'self'".
    // For any other source list, extend it with 'self' if not already present.
    const newValue = existing === "'none'" || existing.includes("'self'")
      ? "'self'"
      : `${existing} 'self'`;
    headers['Content-Security-Policy'] = csp.replace(
      /frame-ancestors[^;]*(;|$)/,
      `frame-ancestors ${newValue}$1`,
    );
  } else {
    // No frame-ancestors directive — append one.
    headers['Content-Security-Policy'] = `${
      csp.replace(/;?\s*$/, '')
    }; frame-ancestors 'self'`;
  }
}

/**
 * Create an HTML response with security headers.
 *
 * CRUD pages pass the resolved `securityHeaders` (which include user-configured
 * CSP origins like S3 endpoints). Error helpers (notFound, forbidden) omit it
 * and get the strict default — intentionally, since error pages render no
 * external resources and a tighter CSP is preferable.
 */
export function htmlResponse(
  html: string,
  status = 200,
  securityHeaders?: Record<string, string>,
): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...(securityHeaders ?? SECURITY_HEADERS),
    },
  });
}

/**
 * Create a redirect response
 */
export function redirect(url: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: {
      'Location': url,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// JSON API Response Types
// ─────────────────────────────────────────────────────────────

/**
 * Check if a request wants a JSON response.
 * Returns true if Accept header includes 'application/json'.
 */
export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('Accept') ?? '';
  return accept.includes('application/json');
}

/**
 * CRUD action types for JSON responses
 */
export type JsonCrudAction = 'create' | 'update' | 'delete';

/**
 * Successful JSON response for CRUD operations
 */
export interface JsonSuccessResponse {
  success: true;
  action: JsonCrudAction;
  table: string;
  /** Record ID (always string - comes from URL or stringified PK) */
  id: string;
  /** Where the HTML response would redirect */
  redirect: string;
}

/**
 * Validation error response (field-level errors)
 */
export interface JsonValidationErrorResponse {
  success: false;
  action: JsonCrudAction;
  table: string;
  /** Record ID (present for update/delete, absent for create) */
  id?: string;
  errors: {
    /** Form-level errors (CSRF, general) */
    _form?: string[];
    /** Field-level errors keyed by field name */
    [fieldName: string]: string[] | undefined;
  };
}

/**
 * Authorization or not-found error response
 */
export interface JsonErrorResponse {
  success: false;
  error: 'forbidden' | 'not_found';
  message: string;
}

/**
 * All possible JSON responses from CRUD endpoints
 */
export type JsonCrudResponse =
  | JsonSuccessResponse
  | JsonValidationErrorResponse
  | JsonErrorResponse;

/**
 * Create a JSON success response for CRUD operations
 */
export function jsonSuccess(
  action: JsonCrudAction,
  table: string,
  id: string,
  redirect: string,
): Response {
  const data: JsonSuccessResponse = {
    success: true,
    action,
    table,
    id,
    redirect,
  };
  // 201 for create, 200 for update/delete
  const status = action === 'create' ? 201 : 200;
  return jsonResponse(data, status);
}

/**
 * Create a JSON validation error response
 */
export function jsonValidationError(
  action: JsonCrudAction,
  table: string,
  errors: Record<string, string | string[]>,
  id?: string,
): Response {
  // Normalize errors to arrays
  const normalizedErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(errors)) {
    normalizedErrors[key] = Array.isArray(value) ? value : [value];
  }
  const data: JsonValidationErrorResponse = {
    success: false,
    action,
    table,
    ...(id !== undefined && { id }),
    errors: normalizedErrors,
  };
  return jsonResponse(data, 400);
}

/**
 * Create a JSON error response (forbidden, not found)
 */
export function jsonError(
  error: 'forbidden' | 'not_found',
  message: string,
): Response {
  const data: JsonErrorResponse = { success: false, error, message };
  const status = error === 'forbidden' ? 403 : 404;
  return jsonResponse(data, status);
}

// ─────────────────────────────────────────────────────────────
// Flash Messages (HTML responses)
// ─────────────────────────────────────────────────────────────

/**
 * Predefined flash message codes (secure - no user input echoed)
 */
export type FlashCode =
  | 'list_forbidden'
  | 'read_forbidden'
  | 'delete_success'
  | 'delete_fk_error'
  | 'delete_error'
  | 'delete_csrf_error'
  | 'delete_forbidden'
  | 'delete_not_found'
  | 'create_success'
  | 'create_error'
  | 'create_forbidden'
  | 'update_success'
  | 'update_error'
  | 'update_forbidden'
  | 'update_not_found';

const FLASH_MESSAGES: Record<
  FlashCode,
  { type: 'success' | 'error' | 'info' | 'warning'; message: string }
> = {
  list_forbidden: {
    type: 'error',
    message: 'You do not have permission to view this table.',
  },
  read_forbidden: {
    type: 'error',
    message: 'You do not have permission to view this record.',
  },
  delete_success: { type: 'success', message: 'Record deleted successfully.' },
  delete_fk_error: {
    type: 'error',
    message:
      'Cannot delete this record because it is referenced by other records. Remove those references first.',
  },
  delete_error: {
    type: 'error',
    message: 'Failed to delete record. Please try again.',
  },
  delete_csrf_error: {
    type: 'error',
    message: 'Invalid or expired form. Please try again.',
  },
  delete_forbidden: {
    type: 'error',
    message: 'You do not have permission to delete this record.',
  },
  delete_not_found: {
    type: 'error',
    message: 'Record not found. It may have already been deleted.',
  },
  create_success: { type: 'success', message: 'Record created successfully.' },
  create_error: {
    type: 'error',
    message: 'Failed to create record. Please try again.',
  },
  create_forbidden: {
    type: 'error',
    message: 'You do not have permission to create records in this table.',
  },
  update_success: { type: 'success', message: 'Record updated successfully.' },
  update_error: {
    type: 'error',
    message: 'Failed to update record. Please try again.',
  },
  update_forbidden: {
    type: 'error',
    message: 'You do not have permission to update this record.',
  },
  update_not_found: {
    type: 'error',
    message: 'Record not found. It may have been deleted.',
  },
};

/**
 * Create a redirect response with a flash message code
 */
export function redirectWithFlash(
  url: string,
  code: FlashCode,
  status = 303,
): Response {
  const urlObj = new URL(url, 'http://localhost');
  urlObj.searchParams.set('_flash', code);
  const redirectUrl = urlObj.pathname + urlObj.search;
  return new Response(null, {
    status,
    headers: {
      'Location': redirectUrl,
    },
  });
}

/**
 * Parse flash message from URL query params (looks up predefined messages)
 */
export function parseFlashFromUrl(
  url: URL,
):
  | { type: 'success' | 'error' | 'info' | 'warning'; message: string }
  | undefined {
  const code = url.searchParams.get('_flash');
  if (code && code in FLASH_MESSAGES) {
    return FLASH_MESSAGES[code as FlashCode];
  }
  return undefined;
}

/**
 * Create a JSON response
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = 'Not Found'): Response {
  return htmlResponse(
    `
    <!DOCTYPE html>
    <html>
    <head><title>404 Not Found</title></head>
    <body>
      <h1>404 Not Found</h1>
      <p>${escapeHtml(message)}</p>
    </body>
    </html>
  `,
    404,
  );
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = 'Forbidden'): Response {
  return htmlResponse(
    `
    <!DOCTYPE html>
    <html>
    <head><title>403 Forbidden</title></head>
    <body>
      <h1>403 Forbidden</h1>
      <p>${escapeHtml(message)}</p>
    </body>
    </html>
  `,
    403,
  );
}

/**
 * Create a 405 Method Not Allowed response
 */
export function methodNotAllowed(allowed: string[]): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      'Allow': allowed.join(', '),
    },
  });
}

/**
 * Parse form data from a Request
 * Returns a plain object with string values (or string[] for multiple values)
 */
export async function parseFormData(
  request: Request,
): Promise<Record<string, string | string[]>> {
  const formData = await request.formData();
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of formData.entries()) {
    // Skip file inputs for now (handle separately)
    if (value instanceof File) {
      continue;
    }

    const existing = result[key];
    if (existing !== undefined) {
      // Multiple values with same name
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Result of reading a request body under a size cap.
 */
export interface BodyLimitResult {
  /** True when the body exceeded `maxBytes` and was rejected. */
  tooLarge: boolean;
  /** Decoded body text. Empty string when there was no body or it was rejected. */
  body: string;
}

/**
 * Read a request body as text while enforcing a hard byte cap.
 *
 * Rejects in two stages:
 * 1. If `Content-Length` advertises more than `maxBytes`, reject before reading.
 * 2. Otherwise stream `request.body`, tallying bytes as they arrive, and abort
 *    the moment the running total exceeds `maxBytes` — cancelling the stream so
 *    the rest of an oversized (e.g. `Transfer-Encoding: chunked`) body is never
 *    buffered into memory.
 *
 * The body is read here (not re-read by the caller) because a request body
 * stream can only be consumed once; valid bodies are returned so the handler
 * can use them without a second read.
 *
 * @returns `{ tooLarge: true, body: '' }` when rejected, otherwise the decoded body.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<BodyLimitResult> {
  // Reject early when Content-Length advertises an oversized body.
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    // Actively cancel the incoming stream so the client isn't left sending a
    // body we'll never read (mirrors the streaming path's reader.cancel()).
    await request.body?.cancel();
    return { tooLarge: true, body: '' };
  }

  if (!request.body) {
    return { tooLarge: false, body: '' };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes) {
        await reader.cancel();
        return { tooLarge: true, body: '' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate the collected chunks, then decode once we know the body fits.
  const buf = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.length;
  }
  return { tooLarge: false, body: new TextDecoder().decode(buf) };
}

/**
 * Thrown into a {@link capStream} stream when the running byte total exceeds the
 * cap mid-transfer. A consumer (e.g. an upload route) can `instanceof`-check it
 * to map the failure to a `413` rather than a generic `500`.
 */
export class BodyTooLargeError extends Error {
  constructor(message = 'Request body too large') {
    super(message);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Result of capping a request body stream.
 */
export interface CapStreamResult {
  /** True when `Content-Length` already advertises an oversized body. */
  tooLarge: boolean;
  /**
   * The size-capped byte stream, or `null` when rejected up front
   * (`tooLarge`) or the request had no body. The stream errors with a
   * {@link BodyTooLargeError} if the running total exceeds `maxBytes`.
   */
  stream: ReadableStream<Uint8Array> | null;
}

/**
 * Expose a request body as a size-capped byte stream **without buffering it**.
 *
 * The streaming, non-decoding counterpart to {@link readBodyWithLimit}: it
 * shares the same two-stage cap (reject early on an oversized `Content-Length`,
 * otherwise tally bytes as they flow and error the stream the moment the running
 * total exceeds `maxBytes`) but hands the raw bytes straight through, so binary
 * payloads never make a lossy text round-trip and the whole body is never held
 * in memory at once.
 *
 * @returns `{ tooLarge: true, stream: null }` when rejected up front, otherwise
 * the capped stream (`null` when the request had no body).
 */
export function capStream(
  request: Request,
  maxBytes: number,
): CapStreamResult {
  // Reject early when Content-Length advertises an oversized body.
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    // Cancel so the client isn't left sending a body we'll never read.
    // Swallow rejections: a failed cancel would otherwise surface as an
    // unhandled rejection (fatal on Node).
    request.body?.cancel().catch(() => {});
    return { tooLarge: true, stream: null };
  }

  if (!request.body) {
    return { tooLarge: false, stream: null };
  }

  let received = 0;
  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.length;
      if (received > maxBytes) {
        // Errors the readable side; the consumer's write/pipe rejects so an
        // oversized (e.g. chunked) body is never fully buffered.
        controller.error(new BodyTooLargeError());
        return;
      }
      controller.enqueue(chunk);
    },
  });

  return { tooLarge: false, stream: request.body.pipeThrough(cap) };
}

/**
 * Result of parsing multipart form data with file columns
 */
export interface ParsedMultipartData {
  /** String form fields (same as parseFormData) */
  fields: Record<string, string | string[]>;
  /** Parsed file references keyed by field name */
  files: Record<string, FileReference>;
  /** Validation errors keyed by field name */
  errors: Record<string, string>;
}

/**
 * Parse multipart form data including file uploads.
 * Converts uploaded files to FileReference objects with base64 data.
 *
 * @param request The incoming request
 * @param fileColumns Columns that are file fields (have cmsOptions.file: true|{...})
 */
export async function parseMultipartFormData(
  request: Request,
  fileColumns: IntrospectedColumn[],
): Promise<ParsedMultipartData> {
  const formData = await request.formData();
  const fields: Record<string, string | string[]> = {};
  const files: Record<string, FileReference> = {};
  const errors: Record<string, string> = {};

  // Build lookup for file columns by property name
  const fileColumnMap = new Map(
    fileColumns.map((col) => [col.propertyName, col]),
  );

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Check if this is a file column
      const column = fileColumnMap.get(key);
      if (!column) {
        // Not a known file column, skip
        continue;
      }

      // Skip empty file inputs (user didn't select a file)
      if (!value.name || value.size === 0) {
        continue;
      }

      // Get column file options (supports `file: true` shorthand)
      const cmsOptions = column.cmsOptions ?? {};
      const fileOptions = cmsOptions.file;
      const fileConfig: Record<string, unknown> = fileOptions === true
        ? {}
        : fileOptions && typeof fileOptions === 'object'
        ? fileOptions as Record<string, unknown>
        : {};
      const maxSize = typeof fileConfig.maxSize === 'number'
        ? fileConfig.maxSize
        : FILE_DEFAULT_MAX_SIZE;
      const accept = typeof fileConfig.accept === 'string'
        ? fileConfig.accept
        : FILE_DEFAULT_ACCEPT;

      // Validate file size
      if (value.size > maxSize) {
        const maxSizeKb = Math.round(maxSize / 1000);
        errors[key] = `File too large. Maximum size is ${maxSizeKb}KB.`;
        continue;
      }

      // If a file extension is present, cross-validate the claimed content type
      // against the extension. Files without extensions skip this check and
      // rely on content-type + accept pattern validation alone.
      // Duplicated in packages/plugins/s3-storage/mod.ts.
      const extMatch = value.name.match(/\.[^.]+$/);
      if (extMatch) {
        const expectedType = typeByExtension(extMatch[0]!.toLowerCase());
        if (!expectedType) {
          errors[key] = `Unrecognised file extension: ${extMatch[0]}`;
          continue;
        }
        if (value.type && value.type.toLowerCase() !== expectedType) {
          errors[key] =
            `Content type mismatch: file extension suggests ${expectedType}, but got ${value.type}`;
          continue;
        }
      }

      // Validate content type against accept pattern
      if (!matchesAcceptPattern(value.type, accept)) {
        errors[key] = `Invalid file type. Accepted: ${accept}`;
        continue;
      }

      // Read file and convert to base64
      try {
        const arrayBuffer = await value.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);

        files[key] = {
          filename: value.name,
          contentType: value.type || 'application/octet-stream',
          size: value.size,
          data: base64,
        };
      } catch {
        errors[key] = 'Failed to read file.';
      }
    } else {
      // Regular form field
      const existing = fields[key];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          fields[key] = [existing, value];
        }
      } else {
        fields[key] = value;
      }
    }
  }

  return { fields, files, errors };
}

/**
 * Check if a MIME type matches an accept pattern
 * Supports wildcards like 'image/*' and exact matches
 */
export function matchesAcceptPattern(
  mimeType: string,
  accept: string,
): boolean {
  if (accept === '*/*') return true;

  const patterns = accept.split(',').map((p) => p.trim().toLowerCase());
  const type = mimeType.toLowerCase();

  for (const pattern of patterns) {
    if (pattern === type) return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // 'image/' from 'image/*'
      if (type.startsWith(prefix)) return true;
    }
  }

  return false;
}

/**
 * Convert ArrayBuffer to base64 string.
 * Thin wrapper around btoa() for ArrayBuffer input.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Decode base64 to Uint8Array.
 * Thin wrapper around atob() returning Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert form data to typed values based on column types
 * Form fields use propertyName (camelCase), and Drizzle expects propertyName too
 */
export function coerceFormValues(
  formData: Record<string, string | string[]>,
  columns: IntrospectedColumn[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const column of columns) {
    // Form fields use propertyName (e.g., authorId)
    const rawValue = formData[column.propertyName];

    // Skip columns not present in form data (enables partial updates).
    // This is distinct from empty string '' which means "user cleared field".
    if (rawValue === undefined) {
      continue;
    }

    // Handle empty strings - set nullable columns to null
    if (rawValue === '') {
      if (!column.notNull) {
        result[column.propertyName] = null;
      }
      continue;
    }

    // Get string value (use last if array - supports hidden+checkbox pattern
    // where hidden sends 'false' and checked checkbox sends 'true' after it)
    const value: string = Array.isArray(rawValue)
      ? (rawValue[rawValue.length - 1] ?? '')
      : rawValue;

    // Skip empty strings for non-nullable columns
    if (value === '') {
      if (!column.notNull) {
        result[column.propertyName] = null;
      }
      continue;
    }

    // Coerce based on data type, output using propertyName for Drizzle
    result[column.propertyName] = coerceValue(
      value,
      column.dataType ?? 'string',
    );
  }

  return result;
}

/**
 * Coerce a string value to the appropriate type
 */
export function coerceValue(value: string, dataType: string): unknown {
  // Handle empty strings as null for non-string types
  if (value === '' && dataType !== 'string') {
    return null;
  }

  // Integer types
  if (dataType === 'number' || dataType === 'bigint') {
    const parsed = dataType === 'bigint'
      ? parseInt(value, 10)
      : parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }

  // Boolean
  if (dataType === 'boolean') {
    return value === 'true' || value === '1' || value === 'on';
  }

  // JSON types
  if (dataType === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  // Date types - keep as string for database driver
  if (dataType === 'date') {
    return value || null;
  }

  // String types (default)
  return value;
}

/**
 * Build URL with query parameters
 */
export function buildUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(base, 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

/**
 * Extract pagination parameters from URL
 */
export function getPagination(
  url: URL,
  defaultLimit = 25,
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(
      1,
      parseInt(url.searchParams.get('limit') || String(defaultLimit), 10),
    ),
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Extract sort parameters from URL
 */
export function getSort(
  url: URL,
  columns: string[],
): { column: string; direction: 'asc' | 'desc' } | null {
  const sort = url.searchParams.get('sort');
  if (!sort) return null;

  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const column = sort.startsWith('-') ? sort.slice(1) : sort;

  // Validate column exists
  if (!columns.includes(column)) return null;

  return { column, direction };
}

/**
 * Build a RFC 6266-compliant Content-Disposition header value.
 *
 * Uses the dual-parameter form (`filename` + `filename*`) for non-ASCII or
 * percent-containing filenames so modern browsers get the real name while
 * legacy clients receive a safe ASCII fallback. Pure-ASCII filenames that
 * contain no `%` use the single-parameter form unchanged.
 *
 * @example
 * contentDispositionHeader('inline', 'photo.png')
 * // → 'inline; filename="photo.png"'
 *
 * contentDispositionHeader('attachment', 'naïve.png')
 * // → 'attachment; filename="na_ve.png"; filename*=UTF-8\'\'na%C3%AFve.png'
 */
export function contentDispositionHeader(
  disposition: 'inline' | 'attachment',
  filename: string,
): string {
  // Legacy fallback: strip non-ASCII and quoted-string-unsafe characters
  const fallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(
    /["\\]/g,
    '_',
  );
  const encoded = encodeURIComponent(filename);
  // If the filename is pure ASCII and safe, the single parameter is sufficient
  if (fallback === filename && !filename.includes('%')) {
    return `${disposition}; filename="${fallback}"`;
  }
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
