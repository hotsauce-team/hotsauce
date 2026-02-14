// Low-level HMAC-SHA256 cryptographic primitives
// Uses Web Crypto API for cross-platform compatibility

/**
 * Import a secret string as an HMAC key for signing
 */
export function importKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Sign a payload using HMAC-SHA256
 * Returns base64url-encoded signature
 */
export async function signPayload(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await importKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload),
  );
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
export async function verifyPayload(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await importKey(secret);
  const encoder = new TextEncoder();

  // Decode base64url signature
  const base64 = signature.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  const padded = base64 + '==='.slice(0, (4 - (base64.length % 4)) % 4);

  try {
    const signatureBytes = Uint8Array.from(
      atob(padded),
      (c) => c.charCodeAt(0),
    );
    // crypto.subtle.verify is timing-safe
    return crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payload),
    );
  } catch {
    // Invalid base64 or other decoding error
    return false;
  }
}
