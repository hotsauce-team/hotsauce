// JWT utilities using Web Crypto API
// Implements HS256 (HMAC-SHA256) signing

import type { JwtPayload } from './types.ts';

/**
 * Base64url encode (URL-safe base64 without padding)
 */
function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Import secret as HMAC key
 */
async function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Sign a JWT with HS256
 *
 * @param payload - JWT claims (sub, role, etc.)
 * @param secret - Signing secret (32+ characters recommended)
 * @returns Signed JWT string
 *
 * @example
 * ```ts
 * const token = await signJwt(
 *   { sub: '123', role: 'admin', iat: now, exp: now + 3600 },
 *   process.env.JWT_SECRET
 * );
 * ```
 */
export async function signJwt(
  payload: JwtPayload,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters');
  }

  // Header (always HS256)
  const header = { alg: 'HS256', typ: 'JWT' };

  // Encode header and payload
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  // Sign
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${message}.${signatureB64}`;
}

/**
 * Verify and decode a JWT
 *
 * @param token - JWT string to verify
 * @param secret - Signing secret
 * @returns Decoded payload if valid, null if invalid or expired
 *
 * @example
 * ```ts
 * const payload = await verifyJwt(token, process.env.JWT_SECRET);
 * if (payload) {
 *   console.log('User ID:', payload.sub);
 * }
 * ```
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  if (!token || !secret) {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) {
      return null;
    }

    const message = `${headerB64}.${payloadB64}`;

    // Verify signature
    const key = await importKey(secret);
    const signature = base64UrlDecode(signatureB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(message),
    );

    if (!valid) {
      return null;
    }

    // Decode payload
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    // Reject tokens issued in the future (with 60s clock skew tolerance)
    if (payload.iat && payload.iat > now + 60) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Create a JWT payload with standard claims
 *
 * @param userId - User identifier
 * @param identity - User identity (email/username)
 * @param role - Optional user role
 * @param maxAge - Token lifetime in seconds (default: 8 hours)
 * @returns JWT payload ready for signing
 */
export function createJwtPayload(
  userId: string | number,
  identity?: string,
  role?: string,
  maxAge: number = 8 * 60 * 60,
): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: String(userId),
    identity,
    role,
    iat: now,
    exp: now + maxAge,
  };
}

// Re-export JwtPayload type for convenience
export type { JwtPayload };
