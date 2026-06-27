/**
 * Short-lived signed tokens for the fs-storage plugin.
 *
 * Unlike S3 (where SigV4 authenticates the direct PUT/GET), the filesystem
 * plugin's upload and serving routes live inside the CMS. They are authorised
 * by an HMAC-SHA256 token that binds the request to a specific
 * table/column/record/key and expires quickly. This prevents the upload route
 * from being an unauthenticated write-to-disk endpoint (see the plugin README's
 * security notes).
 *
 * Uses the Web Crypto API only, so it runs unchanged on Deno, Node 20+, Bun and
 * Workers. The token format is `base64url(payloadJson).base64url(hmac)`.
 *
 * @module
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice(0, (4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function encodeJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Payload bound to an upload token (`POST {basePath}/fs-storage/_upload`). */
export interface UploadTokenPayload {
  /** Token kind discriminator */
  kind: 'upload';
  /** Table name */
  table: string;
  /** Column name */
  column: string;
  /** Record ID */
  recordId: string;
  /** Storage key the bytes must be written to */
  key: string;
  /** Exact byte length the upload must match */
  size: number;
  /** Declared MIME type */
  contentType: string;
  /** Expiry — epoch seconds */
  exp: number;
}

/** Payload bound to a download token (`GET {basePath}/fs-storage/_serve`). */
export interface DownloadTokenPayload {
  /** Token kind discriminator */
  kind: 'download';
  /** Storage key to stream */
  key: string;
  /** Filename for Content-Disposition */
  filename?: string;
  /** MIME type to serve with */
  contentType?: string;
  /** Expiry — epoch seconds */
  exp: number;
}

type TokenPayload = UploadTokenPayload | DownloadTokenPayload;

/**
 * Sign a token payload. Returns `base64url(json).base64url(hmac)`.
 */
export async function signToken(
  payload: TokenPayload,
  secret: string,
): Promise<string> {
  const encoded = encodeJson(payload);
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verify a signed token. Returns the typed payload if the signature is valid,
 * the `kind` matches, and the token has not expired; otherwise `null`.
 *
 * Signature verification uses `crypto.subtle.verify` (timing-safe).
 *
 * @param nowSeconds Override the current time (epoch seconds) — for tests.
 */
export async function verifyToken<K extends TokenPayload['kind']>(
  token: string,
  secret: string,
  kind: K,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Extract<TokenPayload, { kind: K }> | null> {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  if (!sigPart) return null;

  const key = await importKey(secret);
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBytes(sigPart),
      new TextEncoder().encode(encoded),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch {
    return null;
  }

  if (payload.kind !== kind) return null;
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;

  return payload as Extract<TokenPayload, { kind: K }>;
}
