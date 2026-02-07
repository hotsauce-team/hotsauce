// Password hashing using Web Crypto API (PBKDF2)
// No external dependencies - works in all runtimes

/**
 * Default PBKDF2 parameters
 * Using recommendations from OWASP:
 * - 600,000 iterations for SHA-256 (as of 2023)
 * - 16 byte salt
 * - 32 byte derived key
 */
const PBKDF2_ITERATIONS = 600_000;
/** Maximum iterations to prevent DoS if stored hash is tampered */
const MAX_PBKDF2_ITERATIONS = 2_000_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Hash format: $pbkdf2-sha256$iterations$salt$hash
 * All values are base64 encoded
 */
const HASH_PREFIX = '$pbkdf2-sha256$';

/**
 * Generate cryptographically secure random bytes
 */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Base64 encode
 */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Base64 decode
 */
function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Derive key using PBKDF2
 */
async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8, // bits
  );

  return new Uint8Array(derivedBits);
}

/**
 * Hash a password using PBKDF2-SHA256
 *
 * @param password - Plain text password to hash
 * @returns Hash string in format: $pbkdf2-sha256$iterations$salt$hash
 *
 * @example
 * ```ts
 * const hash = await hashPassword('my-secure-password');
 * // Store hash in database
 * await db.insert(users).values({ email, passwordHash: hash });
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error('Password is required');
  }

  const salt = randomBytes(SALT_LENGTH);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);

  return `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${toBase64(salt)}$${
    toBase64(hash)
  }`;
}

/**
 * Verify a password against a hash
 *
 * @param password - Plain text password to verify
 * @param storedHash - Hash string from database
 * @returns true if password matches, false otherwise
 *
 * @example
 * ```ts
 * const user = await db.select().from(users).where(eq(users.email, email));
 * const valid = await verifyPassword(password, user.passwordHash);
 * if (!valid) {
 *   return new Response('Invalid credentials', { status: 401 });
 * }
 * ```
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (!password || !storedHash) {
    return false;
  }

  try {
    // Parse stored hash
    if (!storedHash.startsWith(HASH_PREFIX)) {
      return false;
    }

    const parts = storedHash.slice(HASH_PREFIX.length).split('$');
    if (parts.length !== 3) {
      return false;
    }

    const [iterationsStr, saltB64, hashB64] = parts;
    if (!iterationsStr || !saltB64 || !hashB64) {
      return false;
    }

    const iterations = parseInt(iterationsStr, 10);
    const salt = fromBase64(saltB64);
    const expectedHash = fromBase64(hashB64);

    // Reject invalid or excessive iterations (DoS protection)
    if (
      isNaN(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS
    ) {
      return false;
    }

    // Derive hash from provided password
    const actualHash = await pbkdf2(password, salt, iterations);

    // Constant-time comparison to prevent timing attacks
    if (actualHash.length !== expectedHash.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < actualHash.length; i++) {
      result |= (actualHash[i] ?? 0) ^ (expectedHash[i] ?? 0);
    }

    return result === 0;
  } catch {
    return false;
  }
}
