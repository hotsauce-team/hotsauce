// Cookie utilities for JWT authentication
// Shared between auth handlers

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
 * @returns Set-Cookie header value
 */
export function createAuthCookie(
  cookieName: string,
  token: string,
  maxAge: number,
  path: string,
  isSecure: boolean,
): string {
  const parts = [
    `${cookieName}=${token}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
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
 * @returns Set-Cookie header value that expires the cookie
 */
export function createClearCookie(cookieName: string, path: string): string {
  return `${cookieName}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * Check if request is over HTTPS
 *
 * @param request - HTTP request
 * @returns true if request uses HTTPS protocol
 */
export function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === 'https:';
}
