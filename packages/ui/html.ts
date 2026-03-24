// HTML utilities: tagged template with auto-escaping

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape a string for use in a URL path segment.
 * Uses encodeURIComponent to ensure special characters are percent-encoded.
 *
 * @example
 * ```ts
 * escapeUrlPath('hello world') // 'hello%20world'
 * escapeUrlPath('../etc/passwd') // '..%2Fetc%2Fpasswd'
 * escapeUrlPath('table"name') // 'table%22name'
 * ```
 */
export function escapeUrlPath(segment: unknown): string {
  if (segment === null || segment === undefined) {
    return '';
  }
  return encodeURIComponent(String(segment));
}

/**
 * Wrapper to mark a string as safe (already escaped or trusted HTML)
 */
export class SafeHtml {
  constructor(public readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/**
 * Mark a string as safe HTML (won't be escaped)
 * Use sparingly - only for HTML you've already escaped or generated
 */
export function raw(html: string): SafeHtml {
  return new SafeHtml(html);
}

/**
 * Tagged template literal for safe HTML generation
 * Automatically escapes interpolated values unless wrapped in raw()
 *
 * @example
 * ```ts
 * const name = '<script>alert("xss")</script>';
 * html`<p>Hello ${name}</p>`
 * // Returns: <p>Hello &lt;script&gt;alert("xss")&lt;/script&gt;</p>
 *
 * const trustedHtml = raw('<strong>Bold</strong>');
 * html`<p>${trustedHtml}</p>`
 * // Returns: <p><strong>Bold</strong></p>
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const value = values[i];
      if (value instanceof SafeHtml) {
        result += value.value;
      } else if (Array.isArray(value)) {
        // Join arrays (for mapping over items)
        result += value.map((v) =>
          v instanceof SafeHtml ? v.value : escapeHtml(v)
        ).join('');
      } else {
        result += escapeHtml(value);
      }
    }
  }
  return result;
}

/**
 * Build HTML attributes from an object
 * Omits null/undefined/false values, handles boolean attributes
 *
 * @example
 * ```ts
 * attrs({ type: 'text', required: true, disabled: false, value: null })
 * // Returns: 'type="text" required'
 * ```
 */
export function attrs(attributes: Record<string, unknown>): SafeHtml {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (value === true) {
      // Boolean attribute
      parts.push(escapeHtml(key));
    } else {
      parts.push(`${escapeHtml(key)}="${escapeHtml(value)}"`);
    }
  }
  return raw(parts.join(' '));
}

/**
 * Conditionally include content
 */
export function when(condition: unknown, content: string | SafeHtml): SafeHtml {
  return condition
    ? raw(content instanceof SafeHtml ? content.value : content)
    : raw('');
}

/**
 * Join multiple HTML fragments
 */
export function join(items: (string | SafeHtml)[], separator = ''): SafeHtml {
  return raw(
    items.map((item) => item instanceof SafeHtml ? item.value : item).join(
      separator,
    ),
  );
}

/**
 * Check whether a URL is safe for use in href/src attributes.
 * Returns the URL (trimmed) if safe, null if unsafe.
 *
 * Allows: relative URLs (/path, ?query, #hash), http:, https:
 * Blocks: javascript:, data:, vbscript:, scheme-relative (//),
 *         control characters, and percent-encoded control characters.
 *
 * NOTE: Duplicated in packages/workers/executor.ts — keep in sync.
 */
export function getSafeUrl(url: string): string | null {
  const input = url.trim();
  if (!input) return null;

  // Block control characters and backslashes (scheme obfuscation vectors)
  // deno-lint-ignore no-control-regex
  if (/[\x00-\x1f\x7f-\x9f\\]/.test(input)) return null;
  if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(input)) return null;

  // Block scheme-relative URLs (//evil.com)
  if (input.startsWith('//')) return null;

  // If it has a scheme (RFC 3986: ALPHA *(ALPHA/DIGIT/"+"/"-"/".")), only allow http(s)
  if (/^[a-z][a-z0-9+\-.]*:/i.test(input)) {
    if (!/^https?:\/\//i.test(input)) return null;
  }

  return input;
}
