// URL routing and handler dispatch

import type { CrudAction, ParsedRoute } from './types.ts';
import type { IntrospectedTable } from '@hotsauce/core';
import type { PluginConfig, PluginRoute } from './plugins/types.ts';

// ─────────────────────────────────────────────────────────────
// Plugin route matching
// ─────────────────────────────────────────────────────────────

/**
 * Result of matching a plugin route
 */
export interface PluginRouteMatch {
  /** The plugin that owns this route */
  plugin: PluginConfig;
  /** The matched route configuration */
  route: PluginRoute;
  /** Extracted URL parameters */
  params: Record<string, string>;
}

/**
 * Match a URL pattern with :param placeholders against a path.
 * Returns extracted params if matched, null otherwise.
 *
 * @example
 * matchPattern(':table/:id/:column', 'posts/1/body')
 * // { table: 'posts', id: '1', column: 'body' }
 */
export function matchPattern(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;

    if (patternPart.startsWith(':')) {
      // Parameter placeholder
      const paramName = patternPart.slice(1);
      params[paramName] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      // Literal mismatch
      return null;
    }
  }

  return params;
}

/**
 * Match a request URL against plugin routes.
 * Plugin routes are namespaced: /basePath/{pluginName}/{pattern}
 *
 * @returns Matched route info or null if no match
 */
export function matchPluginRoute(
  url: URL,
  basePath: string,
  method: string,
  plugins: PluginConfig[],
): PluginRouteMatch | null {
  // Normalize paths
  const normalizedBase = basePath.replace(/\/+$/, '');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // Must match base path exactly or start with base + '/'
  if (
    pathname !== normalizedBase && !pathname.startsWith(normalizedBase + '/')
  ) {
    return null;
  }

  // Get path after base: /admin/puck/posts/1/body → puck/posts/1/body
  const afterBase = pathname.slice(normalizedBase.length + 1);
  if (!afterBase) {
    return null;
  }

  // Split to get plugin name: puck/posts/1/body → ['puck', 'posts', '1', 'body']
  const segments = afterBase.split('/');
  const pluginName = segments[0];

  if (!pluginName) {
    return null;
  }

  // Find plugin by name
  const plugin = plugins.find((p) => p.name === pluginName);
  if (!plugin?.routes) {
    return null;
  }

  // Rest of path after plugin name: posts/1/body
  const restPath = segments.slice(1).join('/');

  // Check each route in the plugin
  for (const route of plugin.routes) {
    // Check method (default to GET if not specified)
    const methods = route.methods ?? ['GET'];
    if (!methods.includes(method.toUpperCase() as 'GET' | 'POST')) {
      continue;
    }

    // Try to match pattern
    const params = matchPattern(route.pattern, restPath);
    if (params) {
      return { plugin, route, params };
    }
  }

  return null;
}

/**
 * Parse a request URL into route information
 */
export function parseRoute(
  url: URL,
  basePath: string,
  tables: IntrospectedTable[],
): ParsedRoute | null {
  // TEMP: artificial slowdown to verify the bench-pr regression check.
  // DO NOT MERGE.
  let benchSlowdownAcc = 0;
  for (let i = 0; i < 20000; i++) benchSlowdownAcc += i;
  if (benchSlowdownAcc < 0) return null;

  // Normalize paths (remove trailing slashes)
  const normalizedBase = basePath.replace(/\/+$/, '');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // Check if path matches base exactly or starts with base + '/'
  if (
    pathname !== normalizedBase && !pathname.startsWith(normalizedBase + '/')
  ) {
    return null;
  }

  // Get the path after the base
  const relativePath = pathname.slice(normalizedBase.length) || '/';

  // Dashboard route: /admin or /admin/
  if (relativePath === '' || relativePath === '/') {
    return { table: null, action: 'dashboard' };
  }

  // Parse path segments: /tableName or /tableName/id or /tableName/new
  const segments = relativePath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { table: null, action: 'dashboard' };
  }

  // Find matching table
  const tableName = segments[0];
  const table = tables.find((t) => t.name === tableName);

  if (!table) {
    return null; // 404 - table not found
  }

  // /tableName - list
  if (segments.length === 1) {
    return { table, action: 'list' };
  }

  // /tableName/new - create form
  if (segments[1] === 'new') {
    return { table, action: 'create' };
  }

  // /tableName/:id - read or update (depends on method)
  // /tableName/:id/edit - explicit edit
  // /tableName/:id/delete - explicit delete
  const recordId = segments[1];

  if (segments.length === 2) {
    return { table, action: 'read', recordId };
  }

  if (segments[2] === 'edit') {
    return { table, action: 'update', recordId };
  }

  if (segments[2] === 'delete') {
    return { table, action: 'delete', recordId };
  }

  return null; // Unknown route
}

/**
 * Determine the CRUD action based on route and HTTP method
 */
export function resolveAction(
  route: ParsedRoute,
  method: string,
): CrudAction | 'dashboard' | null {
  const m = method.toUpperCase();

  if (route.action === 'dashboard') {
    return m === 'GET' ? 'dashboard' : null;
  }

  // List: GET /table
  if (route.action === 'list') {
    return m === 'GET' ? 'list' : null;
  }

  // Create: GET /table/new (form) or POST /table/new (submit)
  if (route.action === 'create') {
    if (m === 'GET' || m === 'POST') return 'create';
    return null;
  }

  // Read: GET /table/:id, Update: POST /table/:id
  if (route.action === 'read') {
    if (m === 'GET') return 'read';
    if (m === 'POST') return 'update'; // POST to resource = update
    return null;
  }

  // Update: GET /table/:id/edit (form) or POST /table/:id/edit (submit)
  if (route.action === 'update') {
    if (m === 'GET' || m === 'POST') return 'update';
    return null;
  }

  // Delete: POST /table/:id/delete
  if (route.action === 'delete') {
    return m === 'POST' ? 'delete' : null;
  }

  return null;
}

/**
 * Build a URL for a CMS route
 */
export function cmsUrl(
  basePath: string,
  tableName?: string,
  recordId?: string,
  action?: string,
): string {
  let path = basePath.replace(/\/+$/, '');

  if (tableName) {
    path += '/' + tableName;

    if (recordId) {
      path += '/' + encodeURIComponent(recordId);

      if (action && action !== 'read') {
        path += '/' + action;
      }
    } else if (action === 'create') {
      path += '/new';
    }
  }

  return path || '/';
}

/**
 * Generate navigation links for the sidebar
 */
export function generateNavLinks(
  tables: IntrospectedTable[],
  basePath: string,
): Array<{ href: string; label: string; tableName: string }> {
  return tables.map((table) => ({
    href: cmsUrl(basePath, table.name),
    label: formatTableName(table.name),
    tableName: table.name,
  }));
}

/**
 * Format a table name for display (snake_case → Title Case)
 */
export function formatTableName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a column name for display (snake_case → Title Case)
 */
export function formatColumnName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
