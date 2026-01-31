// Challenge token utilities for 2FA verification
// Uses HMAC-SHA256 to create signed, time-limited tokens

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Minimum secret length for challenge tokens (32 chars = 256 bits) */
const MIN_SECRET_LENGTH = 32;

/**
 * Create a signed challenge token for 2FA verification
 *
 * Token format: base64(userId|expiresAt|signature)
 * - Binds user ID to prevent reuse across accounts
 * - Short TTL prevents replay attacks
 * - HMAC signature prevents tampering
 *
 * @param userId - User ID to bind to the challenge
 * @param secret - Secret key for signing (use CMS_2FA_SECRET, must be ≥32 chars)
 * @returns Signed challenge token
 * @throws Error if secret is too short
 */
export async function createChallengeToken(
  userId: string | number,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Challenge secret must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }

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
 * @param secret - Secret key for verification (must be ≥32 chars)
 * @returns User ID if valid, null if invalid/expired/tampered/weak-secret
 */
export async function verifyChallengeToken(
  token: string,
  secret: string,
): Promise<string | number | null> {
  // Reject weak secrets to prevent forgery
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }

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

// ─────────────────────────────────────────────────────────────
// Encryption for sensitive token data
// ─────────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM key from the secret using HKDF
 */
async function deriveEncryptionKey(
  secret: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: salt.buffer as ArrayBuffer,
      info: encoder.encode('challenge-encryption'),
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt sensitive data for inclusion in challenge tokens
 *
 * Use this when the token payload contains secrets (like TOTP setup tokens).
 * Format: base64(salt|iv|ciphertext)
 *
 * @param plaintext - Data to encrypt
 * @param secret - Encryption key (use CMS_2FA_SECRET)
 * @returns Encrypted string (base64)
 */
export async function encryptTokenData(
  plaintext: string,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `Encryption secret must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }

  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveEncryptionKey(secret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(
    salt.length + iv.length + ciphertext.byteLength,
  );
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data from a challenge token
 *
 * @param encrypted - Base64-encoded encrypted string
 * @param secret - Decryption key (use CMS_2FA_SECRET)
 * @returns Decrypted string, or null if decryption fails
 */
export async function decryptTokenData(
  encrypted: string,
  secret: string,
): Promise<string | null> {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }

  try {
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract salt (16 bytes), iv (12 bytes), and ciphertext
    if (combined.length < 16 + 12 + 1) {
      return null;
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveEncryptionKey(secret, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
