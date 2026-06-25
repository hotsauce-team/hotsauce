// Cookie utilities for JWT authentication
// Shared between auth handlers

/**
 * SameSite cookie attribute for auth cookies.
 *
 * - `Lax` (default): sent on top-level cross-site navigation (e.g. following a
 *   link into an authed page) but not on cross-site subrequests. Mitigates CSRF
 *   while preserving normal navigation UX.
 * - `Strict`: never sent on any cross-site request. Strongest CSRF posture, but
 *   breaks top-level cross-site navigation into authed pages (an external link
 *   to the admin lands the user logged-out until they navigate same-site).
 *
 * `None` is intentionally not offered: it disables SameSite CSRF protection and
 * only makes sense for cross-site embedding, which the admin UI does not need.
 */
export type SameSite = 'Lax' | 'Strict';

/**
 * Parse JWT token from Cookie header
 *
 * @param request - HTTP request
 * @param cookieName - Name of the cookie to find
 * @returns Token string or null if not found
 */
export function getTokenFromCookies(
  request: Request,
  cookieName: string,
): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  // Parse cookies (simple implementation)
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === cookieName) {
      return valueParts.join('='); // Handle = in value
    }
  }

  return null;
}

/**
 * Create Set-Cookie header for JWT token
 *
 * @param cookieName - Cookie name
 * @param token - JWT token value
 * @param maxAge - Cookie lifetime in seconds
 * @param path - Cookie path (typically basePath)
 * @param isSecure - Whether to add Secure flag (HTTPS only)
 * @param sameSite - SameSite attribute (default: 'Lax')
 * @returns Set-Cookie header value
 */
export function createAuthCookie(
  cookieName: string,
  token: string,
  maxAge: number,
  path: string,
  isSecure: boolean,
  sameSite: SameSite = 'Lax',
): string {
  const parts = [
    `${cookieName}=${token}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Create Set-Cookie header to clear JWT cookie
 *
 * @param cookieName - Cookie name to clear
 * @param path - Cookie path
 * @param isSecure - Whether to add Secure flag (must match original cookie)
 * @param sameSite - SameSite attribute (default: 'Lax'; should match original)
 * @returns Set-Cookie header value that expires the cookie
 */
export function createClearCookie(
  cookieName: string,
  path: string,
  isSecure: boolean,
  sameSite: SameSite = 'Lax',
): string {
  const parts = [
    `${cookieName}=`,
    `Path=${path}`,
    'Max-Age=0',
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * Check if request is over HTTPS (handles TLS-terminating proxies)
 *
 * Checks multiple indicators:
 * 1. X-Forwarded-Proto header (set by reverse proxies)
 * 2. Request URL protocol (direct HTTPS connections)
 *
 * @param request - HTTP request
 * @returns true if request originated over HTTPS
 */
export function isSecureRequest(request: Request): boolean {
  // Check X-Forwarded-Proto first (common for TLS-terminating proxies)
  const forwardedProto = request.headers.get('X-Forwarded-Proto');
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https';
  }

  // Fall back to URL protocol for direct connections
  const url = new URL(request.url);
  return url.protocol === 'https:';
}
