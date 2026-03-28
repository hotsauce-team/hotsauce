/**
 * AWS SigV4 Signing Implementation
 *
 * Custom implementation using only Web Crypto API.
 * Works in Deno, Node 20+, Bun, Cloudflare Workers.
 *
 * References:
 * - https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 * - https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
 *
 * @module
 */

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ALGORITHM = 'AWS4-HMAC-SHA256';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

// ─────────────────────────────────────────────────────────────
// Signing Key Cache
// ─────────────────────────────────────────────────────────────

/**
 * Cache for derived signing keys.
 * Keys are expensive to derive (4 HMAC operations), so we cache them.
 *
 * Cache key format: `${accessKeyId}:${secretFingerprint}:${date}:${region}:s3`
 * This ensures keys are NOT reused across:
 * - Different credentials (accessKeyId)
 * - Different secret values (rotation safety)
 * - Different dates (SigV4 keys are date-scoped)
 * - Different regions
 *
 * MUST-Address #2: Safe caching under tenant-dynamic credentials
 * The cache key includes accessKeyId + secret hash, preventing stale cache
 * reuse when secrets rotate for the same access key ID.
 */
const signingKeyCache = new Map<string, ArrayBuffer>();

/**
 * Generate a compact SHA-256 fingerprint for cache partitioning.
 * Used only to avoid embedding raw secrets in cache keys.
 */
async function getSecretFingerprint(secretAccessKey: string): Promise<string> {
  // 64-bit prefix of SHA-256 is sufficient for cache partitioning.
  return toHex(await sha256(secretAccessKey)).slice(0, 16);
}

/**
 * Get cache key for signing key derivation.
 * Includes all elements that affect the signing key.
 */
function getSigningKeyCacheKey(
  accessKeyId: string,
  secretFingerprint: string,
  dateStamp: string,
  region: string,
): string {
  return `${accessKeyId}:${secretFingerprint}:${dateStamp}:${region}:s3`;
}

/**
 * Clear old entries from cache to prevent unbounded growth.
 * Called periodically when cache exceeds threshold.
 */
function pruneSigningKeyCache(maxSize = 100): void {
  if (signingKeyCache.size > maxSize) {
    // Simple LRU-ish: delete oldest half when over limit
    const keysToDelete = [...signingKeyCache.keys()].slice(
      0,
      Math.floor(maxSize / 2),
    );
    for (const key of keysToDelete) {
      signingKeyCache.delete(key);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Crypto Primitives
// ─────────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 of data using the given key.
 */
async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  // Ensure we have a proper ArrayBuffer (not SharedArrayBuffer)
  let keyBuffer: ArrayBuffer;
  if (key instanceof Uint8Array) {
    // Copy to a new ArrayBuffer to ensure it's not backed by SharedArrayBuffer
    keyBuffer = new Uint8Array(key).buffer as ArrayBuffer;
  } else {
    keyBuffer = key as ArrayBuffer;
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const encoder = new TextEncoder();
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

/**
 * Compute SHA-256 hash of data.
 */
function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(data));
}

/**
 * Convert ArrayBuffer to lowercase hex string.
 */
function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────

/**
 * Format date as YYYYMMDD for credential scope.
 */
export function formatDateStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Format date as ISO 8601 basic format (YYYYMMDDTHHMMSSZ).
 */
export function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ─────────────────────────────────────────────────────────────
// Signing Key Derivation
// ─────────────────────────────────────────────────────────────

/**
 * Derive the SigV4 signing key.
 *
 * kSecret = secretAccessKey
 * kDate = HMAC("AWS4" + kSecret, DateStamp)
 * kRegion = HMAC(kDate, Region)
 * kService = HMAC(kRegion, Service)
 * kSigning = HMAC(kService, "aws4_request")
 *
 * Uses caching to avoid repeated derivation.
 */
export async function getSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  accessKeyId: string,
): Promise<ArrayBuffer> {
  const secretFingerprint = await getSecretFingerprint(secretAccessKey);

  // Check cache first
  const cacheKey = getSigningKeyCacheKey(
    accessKeyId,
    secretFingerprint,
    dateStamp,
    region,
  );
  const cached = signingKeyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Derive the key
  const encoder = new TextEncoder();
  const kSecret = encoder.encode('AWS4' + secretAccessKey);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');

  // Cache and prune
  signingKeyCache.set(cacheKey, kSigning);
  pruneSigningKeyCache();

  return kSigning;
}

// ─────────────────────────────────────────────────────────────
// URI Encoding
// ─────────────────────────────────────────────────────────────

/**
 * URI encode a string per AWS SigV4 spec.
 * All characters except A-Z, a-z, 0-9, '-', '.', '_', '~' are percent-encoded.
 */
export function uriEncode(str: string, encodeSlash = true): string {
  let encoded = '';
  for (const char of str) {
    if (
      (char >= 'A' && char <= 'Z') ||
      (char >= 'a' && char <= 'z') ||
      (char >= '0' && char <= '9') ||
      char === '-' ||
      char === '.' ||
      char === '_' ||
      char === '~'
    ) {
      encoded += char;
    } else if (char === '/' && !encodeSlash) {
      encoded += char;
    } else {
      // Percent-encode the character
      const bytes = new TextEncoder().encode(char);
      for (const byte of bytes) {
        encoded += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return encoded;
}

// ─────────────────────────────────────────────────────────────
// Canonical Request Construction
// ─────────────────────────────────────────────────────────────

/**
 * Headers that should be signed.
 */
interface SignedHeaders {
  /** Header names in lowercase, sorted alphabetically */
  names: string[];
  /** Header values keyed by lowercase name */
  values: Record<string, string>;
}

/**
 * Build canonical headers string and signed headers string.
 */
function buildCanonicalHeaders(headers: SignedHeaders): {
  canonicalHeaders: string;
  signedHeaders: string;
} {
  const canonicalHeaders = headers.names
    .map((name) => `${name}:${headers.values[name]!.trim()}`)
    .join('\n') + '\n';
  const signedHeaders = headers.names.join(';');
  return { canonicalHeaders, signedHeaders };
}

/**
 * Build canonical query string from URLSearchParams.
 * Parameters are sorted by key name, then by value.
 */
function buildCanonicalQueryString(params: URLSearchParams): string {
  const entries = [...params.entries()];
  entries.sort((a, b) => {
    const keyCompare = a[0].localeCompare(b[0]);
    if (keyCompare !== 0) return keyCompare;
    return a[1].localeCompare(b[1]);
  });
  return entries
    .map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`)
    .join('&');
}

/**
 * Build the canonical request string.
 *
 * CanonicalRequest =
 *   HTTPRequestMethod + '\n' +
 *   CanonicalURI + '\n' +
 *   CanonicalQueryString + '\n' +
 *   CanonicalHeaders + '\n' +
 *   SignedHeaders + '\n' +
 *   HashedPayload
 */
function buildCanonicalRequest(
  method: string,
  canonicalUri: string,
  queryString: string,
  headers: SignedHeaders,
  payloadHash: string,
): { canonicalRequest: string; signedHeaders: string } {
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headers);

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  return { canonicalRequest, signedHeaders };
}

// ─────────────────────────────────────────────────────────────
// String to Sign
// ─────────────────────────────────────────────────────────────

/**
 * Build the string to sign.
 *
 * StringToSign =
 *   Algorithm + '\n' +
 *   RequestDateTime + '\n' +
 *   CredentialScope + '\n' +
 *   HashedCanonicalRequest
 */
async function buildStringToSign(
  amzDate: string,
  credentialScope: string,
  canonicalRequest: string,
): Promise<string> {
  const hashedRequest = toHex(await sha256(canonicalRequest));
  return [ALGORITHM, amzDate, credentialScope, hashedRequest].join('\n');
}

// ─────────────────────────────────────────────────────────────
// Presigned URL Generation
// ─────────────────────────────────────────────────────────────

/**
 * Options for generating a presigned URL.
 */
export interface PresignOptions {
  /** HTTP method (GET, PUT, DELETE) */
  method: string;
  /** Full URL to sign (without query params from signing) */
  url: string;
  /** Region for signing scope */
  region: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Expiry in seconds (default: 900) */
  expirySeconds?: number;
  /** Additional headers to include in signature */
  headers?: Record<string, string>;
  /** Content-Type (for PUT requests) */
  contentType?: string;
  /** Fixed date for testing (default: now) */
  date?: Date;
}

/**
 * Generate a presigned URL using AWS SigV4.
 *
 * The signature is added as query parameters, not headers.
 * This allows browsers to make direct requests without CORS preflight.
 *
 * @returns Presigned URL string
 */
export async function presignUrl(options: PresignOptions): Promise<string> {
  const {
    method,
    url: urlString,
    region,
    accessKeyId,
    secretAccessKey,
    expirySeconds = 900,
    headers = {},
    date = new Date(),
  } = options;

  const url = new URL(urlString);
  const amzDate = formatAmzDate(date);
  const dateStamp = formatDateStamp(date);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  // Build signed headers — start with host, add any extras from `headers`.
  // Additional signed headers (e.g. Content-Length) are enforced by S3:
  // the client must send the exact same value or the request is rejected.
  const signedHeadersObj: SignedHeaders = {
    names: ['host'],
    values: { host: url.host },
  };

  // Add any additional headers that were explicitly requested to be signed
  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (!signedHeadersObj.values[lowerName]) {
      signedHeadersObj.names.push(lowerName);
    }
    signedHeadersObj.values[lowerName] = value;
  }

  // Sort header names
  signedHeadersObj.names.sort();

  // Build canonical URI (path only, encoded)
  const canonicalUri = uriEncode(
    decodeURIComponent(url.pathname),
    false, // Don't encode slashes in path
  );

  // Build query parameters for presigning
  const queryParams = new URLSearchParams(url.searchParams);
  queryParams.set('X-Amz-Algorithm', ALGORITHM);
  queryParams.set('X-Amz-Credential', credential);
  queryParams.set('X-Amz-Date', amzDate);
  queryParams.set('X-Amz-Expires', String(expirySeconds));
  queryParams.set(
    'X-Amz-SignedHeaders',
    signedHeadersObj.names.join(';'),
  );

  // Build canonical query string (sorted)
  const canonicalQueryString = buildCanonicalQueryString(queryParams);

  // For presigned URLs, payload is always UNSIGNED-PAYLOAD
  const payloadHash = UNSIGNED_PAYLOAD;

  // Build canonical request
  const { canonicalRequest } = await buildCanonicalRequest(
    method,
    canonicalUri,
    canonicalQueryString,
    signedHeadersObj,
    payloadHash,
  );

  // Build string to sign
  const stringToSign = await buildStringToSign(
    amzDate,
    credentialScope,
    canonicalRequest,
  );

  // Get signing key (cached)
  const signingKey = await getSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    accessKeyId,
  );

  // Calculate signature
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  // Build final URL with signature
  queryParams.set('X-Amz-Signature', signature);

  // Reconstruct URL with signed query params
  const signedUrl = new URL(url.origin + url.pathname);
  signedUrl.search = queryParams.toString();

  return signedUrl.toString();
}

// ─────────────────────────────────────────────────────────────
// Signed Headers for DELETE (non-presigned)
// ─────────────────────────────────────────────────────────────

/**
 * Options for generating signed headers.
 */
export interface SignedHeadersOptions {
  /** HTTP method */
  method: string;
  /** Full URL */
  url: string;
  /** Region for signing scope */
  region: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Fixed date for testing (default: now) */
  date?: Date;
}

/**
 * Generate signed headers for a request.
 * Used for DELETE requests that need Authorization header instead of query params.
 *
 * @returns Headers object to include in the request
 */
export async function signHeaders(
  options: SignedHeadersOptions,
): Promise<Record<string, string>> {
  const {
    method,
    url: urlString,
    region,
    accessKeyId,
    secretAccessKey,
    date = new Date(),
  } = options;

  const url = new URL(urlString);
  const amzDate = formatAmzDate(date);
  const dateStamp = formatDateStamp(date);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  // Build signed headers (host and x-amz-date required)
  const signedHeadersObj: SignedHeaders = {
    names: ['host', 'x-amz-date', 'x-amz-content-sha256'],
    values: {
      host: url.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': UNSIGNED_PAYLOAD,
    },
  };
  signedHeadersObj.names.sort();

  // Build canonical URI
  const canonicalUri = uriEncode(
    decodeURIComponent(url.pathname),
    false,
  );

  // Build canonical query string (from URL, not signing params)
  const canonicalQueryString = buildCanonicalQueryString(url.searchParams);

  // Build canonical request
  const { canonicalRequest, signedHeaders } = await buildCanonicalRequest(
    method,
    canonicalUri,
    canonicalQueryString,
    signedHeadersObj,
    UNSIGNED_PAYLOAD,
  );

  // Build string to sign
  const stringToSign = await buildStringToSign(
    amzDate,
    credentialScope,
    canonicalRequest,
  );

  // Get signing key (cached)
  const signingKey = await getSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    accessKeyId,
  );

  // Calculate signature
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  // Build Authorization header
  const authorization =
    `${ALGORITHM} Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': UNSIGNED_PAYLOAD,
  };
}

// ─────────────────────────────────────────────────────────────
// URL Construction Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build object URL based on URL style.
 *
 * @param endpoint - S3 endpoint (e.g., https://s3.us-east-1.amazonaws.com)
 * @param bucket - Bucket name
 * @param key - Object key
 * @param style - URL style: 'virtual-hosted' or 'path'
 */
export function buildObjectUrl(
  endpoint: string,
  bucket: string,
  key: string,
  style: 'virtual-hosted' | 'path',
): string {
  const url = new URL(endpoint);

  if (style === 'virtual-hosted') {
    // https://bucket.endpoint/key
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = '/' + key;
  } else {
    // https://endpoint/bucket/key
    url.pathname = `/${bucket}/${key}`;
  }

  return url.toString();
}
