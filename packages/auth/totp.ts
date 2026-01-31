// TOTP (Time-based One-Time Password) implementation
// RFC 6238 compliant, using Web Crypto API (zero dependencies)

/**
 * Generate a TOTP code for the given secret and time
 *
 * @param secret - Base32-encoded secret
 * @param time - Unix timestamp in seconds (defaults to now)
 * @param digits - Number of digits (default: 6)
 * @param period - Time step in seconds (default: 30)
 */
export async function generateTOTP(
  secret: string,
  time: number = Math.floor(Date.now() / 1000),
  digits: number = 6,
  period: number = 30,
): Promise<string> {
  const counter = Math.floor(time / period);
  const hmac = await hmacSha1(base32Decode(secret), counterToBytes(counter));
  return truncate(hmac, digits);
}

/**
 * Verify a TOTP code against the secret
 *
 * Allows for clock drift by checking codes within the window
 *
 * @param token - The 6-digit code to verify
 * @param secret - Base32-encoded secret
 * @param window - Number of periods to check before/after (default: 1)
 */
export async function verifyTOTP(
  token: string,
  secret: string,
  window: number = 1,
): Promise<boolean> {
  const time = Math.floor(Date.now() / 1000);
  const period = 30;

  // Check current and adjacent time periods to handle clock drift
  for (let i = -window; i <= window; i++) {
    const checkTime = time + i * period;
    const expectedToken = await generateTOTP(secret, checkTime);
    if (timingSafeEqual(token, expectedToken)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a random TOTP secret (base32 encoded)
 *
 * @param length - Number of random bytes (default: 20 = 160 bits)
 */
export function generateTOTPSecret(length: number = 20): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

/**
 * Generate a provisioning URI for authenticator apps
 *
 * Can be encoded as QR code for easy scanning
 *
 * @param secret - Base32-encoded secret
 * @param accountName - User identifier (email)
 * @param issuer - Application name
 */
export function generateTOTPUri(
  secret: string,
  accountName: string,
  issuer: string,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

/** Base32 alphabet (RFC 4648) */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decode base32 string to Uint8Array */
function base32Decode(input: string): Uint8Array {
  // Remove padding and normalize
  const normalized = input.toUpperCase().replace(/=+$/, '');
  const output = new Uint8Array(Math.floor((normalized.length * 5) / 8));

  let bits = 0;
  let value = 0;
  let outputIndex = 0;

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      output[outputIndex++] = (value >>> bits) & 0xff;
    }
  }

  return output;
}

/** Encode Uint8Array to base32 string */
function base32Encode(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  // Handle remaining bits
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

/** Convert counter to 8-byte big-endian buffer */
function counterToBytes(counter: number): Uint8Array {
  const buffer = new Uint8Array(8);
  let remaining = counter;

  for (let i = 7; i >= 0; i--) {
    buffer[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  return buffer;
}

/** Compute HMAC-SHA1 */
async function hmacSha1(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    data as unknown as BufferSource,
  );
  return new Uint8Array(signature);
}

/** Dynamic truncation per RFC 4226 */
function truncate(hmac: Uint8Array, digits: number): string {
  // Get offset from low-order 4 bits of last byte
  const offset = hmac[hmac.length - 1]! & 0x0f;

  // Extract 4 bytes starting at offset
  const binary = ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  // Get the last `digits` decimal digits
  const otp = binary % Math.pow(10, digits);

  // Pad with leading zeros
  return otp.toString().padStart(digits, '0');
}

/** Timing-safe string comparison */
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
