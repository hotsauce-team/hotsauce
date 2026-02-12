// CSRF protection utilities
// Uses HMAC-SHA256 signed tokens via Web Crypto API

import { signPayload, verifyPayload } from './crypto.ts';

const CSRF_TOKEN_NAME = '_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const TOKEN_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
const CLOCK_SKEW_MS = 60_000; // 1 minute tolerance for clock drift

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
    throw new Error('CSRF secret must be at least 32 characters');
  }

  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(random)
    .map((b) => b.toString(16).padStart(2, '0'))
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
export async function validateCsrfToken(
  token: string | null,
  secret: string,
): Promise<boolean> {
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

  if (
    isNaN(tokenTime) ||
    now - tokenTime > TOKEN_MAX_AGE_MS ||
    tokenTime > now + CLOCK_SKEW_MS
  ) {
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
export function getCsrfTokenFromFormData(
  formData: Record<string, string | string[]>,
): string | null {
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
