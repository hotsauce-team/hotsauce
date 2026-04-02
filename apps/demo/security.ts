// Security middleware for the public site
// Adds strict Content Security Policy and other security headers
import type { MiddlewareHandler } from 'hono';

/**
 * Strict Content Security Policy for the public site
 *
 * - No inline scripts or styles (except for trusted sources)
 * - No eval or unsafe-inline
 * - Forms only submit to same origin
 * - No embedding in frames (clickjacking protection)
 */
function buildCspPolicy(imgSrc: string[] = []): string {
  const imgSources = ["'self'", ...imgSrc, 'data:'].join(' ');
  return [
    "default-src 'self'",
    "script-src 'none'", // No JavaScript at all (pure SSR)
    "style-src 'self'", // Only external stylesheets from same origin
    `img-src ${imgSources}`, // Images from same origin + storage + data URIs
    "font-src 'self'", // Fonts from same origin
    "connect-src 'self'", // XHR/fetch to same origin only
    "form-action 'self'", // Forms submit to same origin only
    "frame-ancestors 'none'", // Prevent clickjacking
    "base-uri 'self'", // Restrict <base> tag
    "object-src 'none'", // No plugins (Flash, etc.)
  ].join('; ');
}

/**
 * Create security headers middleware
 * @param imgSrc - Additional trusted img-src origins (e.g., S3 public endpoint)
 */
export function createSecurityHeaders(
  imgSrc: string[] = [],
): MiddlewareHandler {
  const cspPolicy = buildCspPolicy(imgSrc);

  return async (c, next) => {
    await next();

    // Content Security Policy
    c.header('Content-Security-Policy', cspPolicy);

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Referrer policy - don't leak URLs to external sites
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy - disable sensitive browser features
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    );
  };
}

/**
 * CSP policy that allows HTMX (if you add it later)
 * Uncomment and use this instead if you add HTMX interactivity
 */
export const CSP_WITH_HTMX = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com", // Allow HTMX from unpkg
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'", // HTMX makes fetch requests
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');
