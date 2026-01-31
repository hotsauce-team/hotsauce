// Challenge token utilities for 2FA verification
// Uses HMAC-SHA256 to create signed, time-limited tokens

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a signed challenge token for 2FA verification
 *
 * Token format: base64(userId|expiresAt|signature)
 * - Binds user ID to prevent reuse across accounts
 * - Short TTL prevents replay attacks
 * - HMAC signature prevents tampering
 *
 * @param userId - User ID to bind to the challenge
 * @param secret - Secret key for signing (use CMS_2FA_SECRET)
 * @returns Signed challenge token
 */
export async function createChallengeToken(
  userId: string | number,
  secret: string,
): Promise<string> {
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const data = `${userId}|${expiresAt}`;

  const signature = await sign(data, secret);
  const token = `${data}|${signature}`;

  // Encode as base64 for safe transport in forms
  return btoa(token);
}

/**
 * Verify a challenge token and extract the user ID
 *
 * @param token - Challenge token from form
 * @param secret - Secret key for verification
 * @returns User ID if valid, null if invalid/expired/tampered
 */
export async function verifyChallengeToken(
  token: string,
  secret: string,
): Promise<string | number | null> {
  try {
    // Decode from base64
    const decoded = atob(token);
    const parts = decoded.split('|');

    if (parts.length !== 3) {
      return null;
    }

    const userIdStr = parts[0]!;
    const expiresAtStr = parts[1]!;
    const signature = parts[2]!;

    // Check expiration
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return null;
    }

    // Verify signature
    const data = `${userIdStr}|${expiresAtStr}`;
    const expectedSignature = await sign(data, secret);

    if (!timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    // Parse user ID (could be string or number)
    const userId = /^\d+$/.test(userIdStr)
      ? parseInt(userIdStr, 10)
      : userIdStr;

    return userId;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data),
  );

  // Convert to hex string for deterministic encoding
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
