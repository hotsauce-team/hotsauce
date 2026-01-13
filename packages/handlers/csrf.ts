// CSRF protection utilities
// Uses signed tokens to prevent cross-site request forgery

const CSRF_TOKEN_NAME = '_csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * CSRF secret for signing tokens
 * In production, this should be configured via options
 */
let csrfSecret = 'drizzle-cms-default-secret';

/**
 * Set the CSRF secret (call at startup with a secure random value)
 */
export function setCsrfSecret(secret: string): void {
  csrfSecret = secret;
}

/**
 * Generate a CSRF token
 * Token format: timestamp.randomPart.signature
 */
export function generateCsrfToken(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(16));
  const randomPart = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  const payload = `${timestamp}.${randomPart}`;
  const signature = signPayload(payload);
  
  return `${payload}.${signature}`;
}

/**
 * Validate a CSRF token
 * Returns true if valid, false otherwise
 */
export function validateCsrfToken(token: string | null): boolean {
  if (!token) return false;
  
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  const [timestamp, randomPart, signature] = parts;
  if (!timestamp || !randomPart || !signature) return false;
  
  // Verify signature
  const payload = `${timestamp}.${randomPart}`;
  const expectedSignature = signPayload(payload);
  
  if (!constantTimeCompare(signature, expectedSignature)) {
    return false;
  }
  
  // Check token age (max 4 hours)
  const tokenTime = parseInt(timestamp, 36);
  const now = Date.now();
  const maxAge = 4 * 60 * 60 * 1000; // 4 hours
  
  if (isNaN(tokenTime) || now - tokenTime > maxAge) {
    return false;
  }
  
  return true;
}

/**
 * Extract CSRF token from request (checks form data and header)
 */
export async function getCsrfTokenFromRequest(request: Request): Promise<string | null> {
  // Check header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;
  
  // For form submissions, we need to clone the request to read the body
  // The caller should pass the already-parsed form data if available
  return null;
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
 * Sign a payload using the CSRF secret
 * Uses a simple HMAC-like approach with Web Crypto
 */
function signPayload(payload: string): string {
  // Simple hash-based signature
  // For a production system, use Web Crypto's subtle.sign with HMAC
  // This is a simplified version using string operations
  let hash = 0;
  const combined = csrfSecret + payload;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do the comparison to maintain constant time
    b = a;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0 && a.length === b.length;
}
