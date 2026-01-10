// Response helpers and form parsing utilities

import type { IntrospectedColumn } from '@drizzle-cms/core';

/**
 * Create an HTML response
 */
export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

/**
 * Create a redirect response
 */
export function redirect(url: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: {
      'Location': url,
    },
  });
}

/**
 * Create a JSON response
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = 'Not Found'): Response {
  return htmlResponse(`
    <!DOCTYPE html>
    <html>
    <head><title>404 Not Found</title></head>
    <body>
      <h1>404 Not Found</h1>
      <p>${message}</p>
    </body>
    </html>
  `, 404);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = 'Forbidden'): Response {
  return htmlResponse(`
    <!DOCTYPE html>
    <html>
    <head><title>403 Forbidden</title></head>
    <body>
      <h1>403 Forbidden</h1>
      <p>${message}</p>
    </body>
    </html>
  `, 403);
}

/**
 * Create a 405 Method Not Allowed response
 */
export function methodNotAllowed(allowed: string[]): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      'Allow': allowed.join(', '),
    },
  });
}

/**
 * Parse form data from a Request
 * Returns a plain object with string values (or string[] for multiple values)
 */
export async function parseFormData(request: Request): Promise<Record<string, string | string[]>> {
  const formData = await request.formData();
  const result: Record<string, string | string[]> = {};
  
  for (const [key, value] of formData.entries()) {
    // Skip file inputs for now (handle separately)
    if (value instanceof File) {
      continue;
    }
    
    const existing = result[key];
    if (existing !== undefined) {
      // Multiple values with same name
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Convert form data to typed values based on column types
 * Form fields use propertyName (camelCase), and Drizzle expects propertyName too
 */
export function coerceFormValues(
  formData: Record<string, string | string[]>,
  columns: IntrospectedColumn[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const column of columns) {
    // Form fields use propertyName (e.g., authorId)
    const rawValue = formData[column.propertyName];
    
    // Handle missing values
    if (rawValue === undefined || rawValue === '') {
      if (!column.notNull) {
        result[column.propertyName] = null;
      }
      continue;
    }
    
    // Get string value (use first if array)
    const value: string = Array.isArray(rawValue) ? (rawValue[0] ?? '') : rawValue;
    
    // Skip empty strings for non-nullable columns
    if (value === '') {
      if (!column.notNull) {
        result[column.propertyName] = null;
      }
      continue;
    }
    
    // Coerce based on data type, output using propertyName for Drizzle
    result[column.propertyName] = coerceValue(value, column.dataType ?? 'string');
  }
  
  return result;
}

/**
 * Coerce a string value to the appropriate type
 */
export function coerceValue(value: string, dataType: string): unknown {
  // Handle empty strings as null for non-string types
  if (value === '' && dataType !== 'string') {
    return null;
  }
  
  // Integer types
  if (dataType === 'number' || dataType === 'bigint') {
    const parsed = dataType === 'bigint' ? parseInt(value, 10) : parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  
  // Boolean
  if (dataType === 'boolean') {
    return value === 'true' || value === '1' || value === 'on';
  }
  
  // JSON types
  if (dataType === 'json') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  
  // Date types - keep as string for database driver
  if (dataType === 'date') {
    return value || null;
  }
  
  // String types (default)
  return value;
}

/**
 * Build URL with query parameters
 */
export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base, 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

/**
 * Extract pagination parameters from URL
 */
export function getPagination(url: URL, defaultLimit = 25): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || String(defaultLimit), 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Extract sort parameters from URL
 */
export function getSort(url: URL, columns: string[]): { column: string; direction: 'asc' | 'desc' } | null {
  const sort = url.searchParams.get('sort');
  if (!sort) return null;
  
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const column = sort.startsWith('-') ? sort.slice(1) : sort;
  
  // Validate column exists
  if (!columns.includes(column)) return null;
  
  return { column, direction };
}
