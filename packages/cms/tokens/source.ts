// Source token utilities
// Identifies the origin of form submissions (CMS core vs plugins)
// Prevents plugins from masquerading as CMS core to bypass policies

import { signPayload, verifyPayload } from './crypto.ts';

/** Form field name for source tokens */
export const SOURCE_FIELD_NAME: string = '__cms_source';

/** Token expiry time (4 hours, same as CSRF) */
const TOKEN_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** Clock skew tolerance */
const CLOCK_SKEW_MS = 60_000;

/**
 * Well-known source identifiers
 */
export const SOURCE = {
  /** Core CMS forms */
  CMS: 'cms',
  /** Plugin prefix - actual value will be `plugin:{name}` */
  PLUGIN_PREFIX: 'plugin:',
} as const;

/**
 * Create a plugin source identifier
 * @param pluginName - Name of the plugin
 * @returns Source identifier like 'plugin:puck'
 */
export function pluginSource(pluginName: string): string {
  return `${SOURCE.PLUGIN_PREFIX}${pluginName}`;
}

/**
 * Check if a source is from a plugin
 * @param source - Source identifier to check
 * @returns True if source is a plugin source
 */
export function isPluginSource(source: string | undefined): boolean {
  if (!source) return false;
  return source.startsWith(SOURCE.PLUGIN_PREFIX);
}

/**
 * Extract plugin name from a plugin source
 * @param source - Source identifier like 'plugin:puck'
 * @returns Plugin name or undefined if not a plugin source
 */
export function getPluginName(source: string | undefined): string | undefined {
  if (!source || !isPluginSource(source)) return undefined;
  return source.slice(SOURCE.PLUGIN_PREFIX.length);
}

/**
 * Generate a signed source token
 *
 * Token format: source.timestamp.signature
 *
 * @param source - The source identifier ('cms' or 'plugin:puck')
 * @param secret - HMAC secret for signing (should be at least 32 bytes)
 * @returns Signed source token string
 *
 * @example
 * ```ts
 * // For CMS forms
 * const token = await generateSourceToken('cms', secret);
 *
 * // For plugin forms
 * const token = await generateSourceToken('plugin:puck', secret);
 * ```
 */
export async function generateSourceToken(
  source: string,
  secret: string,
): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new Error('Source token secret must be at least 32 characters');
  }

  // Validate source format
  if (source !== SOURCE.CMS && !isPluginSource(source)) {
    throw new Error(
      `Invalid source: ${source}. Must be 'cms' or 'plugin:{name}'`,
    );
  }

  const timestamp = Date.now().toString(36);
  const payload = `${source}.${timestamp}`;
  const signature = await signPayload(payload, secret);

  return `${payload}.${signature}`;
}

/**
 * Validate and extract source from a token
 *
 * @param token - The token to validate
 * @param secret - HMAC secret used for signing
 * @returns The source string if valid, null otherwise
 *
 * @example
 * ```ts
 * const source = await validateSourceToken(token, secret);
 * if (source === null) {
 *   // Invalid or expired token
 * } else if (source === 'cms') {
 *   // Request from CMS core
 * } else if (source.startsWith('plugin:')) {
 *   // Request from a plugin
 * }
 * ```
 */
export async function validateSourceToken(
  token: string | null | undefined,
  secret: string,
): Promise<string | null> {
  if (!token || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [source, timestamp, signature] = parts;
  if (!source || !timestamp || !signature) return null;

  // Validate source format
  if (source !== SOURCE.CMS && !isPluginSource(source)) {
    return null;
  }

  // Verify signature using timing-safe comparison
  const payload = `${source}.${timestamp}`;
  const isValidSignature = await verifyPayload(payload, signature, secret);

  if (!isValidSignature) {
    return null;
  }

  // Check token age (not too old AND not in the future)
  const tokenTime = parseInt(timestamp, 36);
  const now = Date.now();

  if (
    isNaN(tokenTime) ||
    now - tokenTime > TOKEN_MAX_AGE_MS ||
    tokenTime > now + CLOCK_SKEW_MS
  ) {
    return null;
  }

  return source;
}

/**
 * Get source token from parsed form data
 */
export function getSourceTokenFromFormData(
  formData: Record<string, string | string[]>,
): string | null {
  const token = formData[SOURCE_FIELD_NAME];
  if (!token) return null;
  return Array.isArray(token) ? token[0] ?? null : token;
}
