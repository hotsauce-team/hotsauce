/**
 * HTML Sanitizer - Allowlist-based XSS prevention
 *
 * Similar to WordPress wp_kses: only allows specific elements and attributes.
 * Uses regex parsing (no DOM dependency) - works in Workers without DOM libs.
 *
 * Designed for sanitizing markdown-generated HTML where the expected
 * output is a known, limited subset of HTML.
 */

/**
 * Allowed elements and their permitted attributes.
 * Elements not in this list have their tags removed (contents preserved).
 * Attributes not in the list for an element are stripped.
 */
const ALLOWED_ELEMENTS: Record<string, string[]> = {
  // Block elements
  p: [],
  br: [],
  hr: [],
  blockquote: [],
  pre: ['class'],
  div: [],

  // Headings
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],

  // Lists
  ul: [],
  ol: [],
  li: [],

  // Inline formatting
  strong: [],
  b: [],
  em: [],
  i: [],
  s: [],
  del: [],
  code: ['class'],
  kbd: [],
  mark: [],
  small: [],
  sub: [],
  sup: [],

  // Links and media
  a: ['href', 'title', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],

  // Tables
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
};

/**
 * Safe URL protocols for href and src attributes.
 * Blocks javascript:, data:, vbscript:, etc.
 */
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Attributes that contain URLs and need protocol validation.
 */
const URL_ATTRIBUTES = ['href', 'src'];

/**
 * Decode HTML entities in a string (for URL validation).
 * Handles decimal (&#65;), hex (&#x41;), and named (&amp;) entities.
 */
function decodeHtmlEntities(str: string): string {
  return str
    // Decode hex entities: &#xNN; or &#xNN (no semicolon)
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    // Decode decimal entities: &#NN; or &#NN (no semicolon)
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Decode common named entities
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
}

/**
 * Check if a URL is safe (no javascript:, data:, etc.)
 * Handles HTML entity encoding and whitespace obfuscation.
 */
function isSafeUrl(url: string): boolean {
  // First decode any HTML entities
  let decoded = decodeHtmlEntities(url);

  // Remove control characters (tabs, newlines, null bytes, zero-width chars)
  // These can be used to break up "javascript:" detection
  decoded = decoded.replace(/[\x00-\x20\x7f\u200B-\u200D\uFEFF]/g, '');

  const trimmed = decoded.trim().toLowerCase();

  // Allow relative URLs
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('//')
  ) {
    return true;
  }

  // If no colon, it's a relative path
  if (!trimmed.includes(':')) {
    return true;
  }

  // Check against allowed protocols
  const colonIndex = trimmed.indexOf(':');
  const protocol = trimmed.substring(0, colonIndex + 1);
  return SAFE_URL_PROTOCOLS.includes(protocol);
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse an attribute string into key-value pairs.
 * Handles: attr="value", attr='value', attr=value, attr (boolean)
 */
function parseAttributes(
  attrString: string,
): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  // Match: name="value", name='value', name=value, or just name
  const attrRegex =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const name = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs.push({ name, value });
  }

  return attrs;
}

/**
 * Sanitize attributes for an allowed element.
 * Returns sanitized attribute string or empty string.
 */
function sanitizeAttributes(
  tagName: string,
  attrString: string,
): string {
  const allowedAttrs = ALLOWED_ELEMENTS[tagName];
  if (!allowedAttrs || allowedAttrs.length === 0) {
    return '';
  }

  const attrs = parseAttributes(attrString);
  const sanitized: string[] = [];

  for (const { name, value } of attrs) {
    // Check if attribute is allowed for this element
    if (!allowedAttrs.includes(name)) {
      continue;
    }

    // Validate URL attributes
    if (URL_ATTRIBUTES.includes(name) && !isSafeUrl(value)) {
      continue;
    }

    // Event handlers starting with "on" are always blocked
    if (name.startsWith('on')) {
      continue;
    }

    // Escape the value and add to sanitized list
    sanitized.push(`${name}="${escapeHtml(value)}"`);
  }

  return sanitized.length > 0 ? ' ' + sanitized.join(' ') : '';
}

/**
 * Sanitize an HTML string using an allowlist approach.
 *
 * - Elements not in ALLOWED_ELEMENTS have their tags removed (contents kept)
 * - Attributes not in the element's allowed list are removed
 * - href/src attributes are validated for safe protocols
 * - Event handlers (onclick, onerror, etc.) are always removed
 *
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  // First, remove HTML comments (can contain sensitive info or IE conditionals)
  let result = html.replace(/<!--[\s\S]*?-->/g, '');

  // Remove stray < characters that could be used for obfuscation (<<SCRIPT>)
  // This handles double-bracket attacks
  result = result.replace(/<(?=[<])/g, '');

  // Process all tags
  // Matches: <tagname ...>, </tagname>, <tagname ... />
  // Also handles malformed tags like <SCRIPT/SRC=...> (slash before attributes)
  result = result.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\/|\s)((?:[^>]*)?)\s*\/?>/g,
    (fullMatch, tagName: string, attrString: string) => {
      const lowerTag = tagName.toLowerCase();

      // Check if this is a closing tag
      if (fullMatch.startsWith('</')) {
        // Allowed closing tag - keep it
        if (lowerTag in ALLOWED_ELEMENTS) {
          return `</${lowerTag}>`;
        }
        // Not allowed - remove the tag entirely
        return '';
      }

      // Opening or self-closing tag
      if (!(lowerTag in ALLOWED_ELEMENTS)) {
        // Not allowed - remove tag but content will be preserved
        return '';
      }

      // Allowed tag - sanitize attributes
      const sanitizedAttrs = sanitizeAttributes(lowerTag, attrString || '');

      // Check if self-closing (void elements or explicit />)
      const isVoid = ['br', 'hr', 'img'].includes(lowerTag);
      const isSelfClosing = fullMatch.endsWith('/>');

      if (isVoid || isSelfClosing) {
        return `<${lowerTag}${sanitizedAttrs} />`;
      }

      return `<${lowerTag}${sanitizedAttrs}>`;
    },
  );

  // Handle tags with no space or slash after name (e.g., <script>)
  result = result.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)>/g,
    (fullMatch, tagName: string) => {
      const lowerTag = tagName.toLowerCase();

      if (fullMatch.startsWith('</')) {
        if (lowerTag in ALLOWED_ELEMENTS) {
          return `</${lowerTag}>`;
        }
        return '';
      }

      if (!(lowerTag in ALLOWED_ELEMENTS)) {
        return '';
      }

      return `<${lowerTag}>`;
    },
  );

  return result;
}
