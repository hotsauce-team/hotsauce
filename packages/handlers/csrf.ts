// CSRF protection utilities
// Uses HMAC-SHA256 signed tokens via Web Crypto API

const CSRF_TOKEN_NAME = '_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const TOKEN_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Import a secret string as an HMAC key for signing
 */
async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Sign a payload using HMAC-SHA256
 * Returns base64url-encoded signature
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  // Convert to base64url (URL-safe base64)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Verify a payload signature using HMAC-SHA256
 * Uses crypto.subtle.verify for timing-safe comparison
 */
async function verifyPayload(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  
  // Decode base64url signature
  const base64 = signature.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  const padded = base64 + '==='.slice(0, (4 - base64.length % 4) % 4);
  
  try {
    const signatureBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    // crypto.subtle.verify is timing-safe
    return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payload));
  } catch {
    // Invalid base64 or other decoding error
    return false;
  }
}

/**
 * Generate a CSRF token
 * Token format: timestamp.randomPart.signature
 * 
 * @param secret - HMAC secret for signing (should be at least 32 bytes of entropy)
 * @returns Signed CSRF token string
 * 
 * @example
 * ```ts
 * const token = await generateCsrfToken(csrfSecret);
 * // Include in form: <input type="hidden" name="_csrf" value="${token}">
 * ```
 */
export async function generateCsrfToken(secret: string): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new Error('CSRF secret must be at least 32 characters (use generateCsrfSecret())');
  }
  
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const payload = `${timestamp}.${randomPart}`;
  const signature = await signPayload(payload, secret);
  
  return `${payload}.${signature}`;
}

/**
 * Validate a CSRF token
 * 
 * @param token - The token to validate
 * @param secret - HMAC secret used for signing
 * @returns true if valid, false otherwise
 * 
 * @example
 * ```ts
 * const isValid = await validateCsrfToken(formToken, csrfSecret);
 * if (!isValid) {
 *   return new Response('Invalid CSRF token', { status: 403 });
 * }
 * ```
 */
export async function validateCsrfToken(token: string | null, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  const [timestamp, randomPart, signature] = parts;
  if (!timestamp || !randomPart || !signature) return false;
  
  // Verify signature using timing-safe comparison
  const payload = `${timestamp}.${randomPart}`;
  const isValidSignature = await verifyPayload(payload, signature, secret);
  
  if (!isValidSignature) {
    return false;
  }
  
  // Check token age (not too old AND not in the future)
  const tokenTime = parseInt(timestamp, 36);
  const now = Date.now();
  const CLOCK_SKEW_MS = 60_000; // 1 minute tolerance for clock drift
  
  if (isNaN(tokenTime) || 
      now - tokenTime > TOKEN_MAX_AGE_MS ||
      tokenTime > now + CLOCK_SKEW_MS) {
    return false;
  }
  
  return true;
}

/**
 * Extract CSRF token from request header
 */
export function getCsrfTokenFromHeader(request: Request): string | null {
  return request.headers.get(CSRF_HEADER_NAME);
}

/**
 * Get CSRF token from parsed form data
 */
export function getCsrfTokenFromFormData(formData: Record<string, string | string[]>): string | null {
  const token = formData[CSRF_TOKEN_NAME];
  if (!token) return null;
  return Array.isArray(token) ? token[0] ?? null : token;
}

/**
 * Get the form field name for CSRF tokens
 */
export function getCsrfFieldName(): string {
  return CSRF_TOKEN_NAME;
}

/**
 * Generate a cryptographically secure random secret for CSRF signing
 * Call this once at application startup and store the result
 * 
 * @returns A 32-byte random secret encoded as base64
 * 
 * @example
 * ```ts
 * // At startup, generate or load from environment
 * const csrfSecret = Deno.env.get('CSRF_SECRET') ?? generateCsrfSecret();
 * 
 * const handler = createCmsHandler({
 *   db,
 *   schema,
 *   csrfSecret,
 * });
 * ```
 */
export function generateCsrfSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}
