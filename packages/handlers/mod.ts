// @drizzle-cms/handlers
// CRUD route handlers using Web Standard Request/Response
// Works with Deno, Node 20+, Bun, Cloudflare Workers

import type { CmsOptions, ResolvedCmsOptions, RouteContext, Handler } from './types.ts';
import { introspectFullSchema } from '@drizzle-cms/core';
import { parseRoute, resolveAction } from './router.ts';
import { notFound, forbidden, methodNotAllowed } from './http.ts';
import { generateCsrfSecret } from './csrf.ts';
import {
  handleDashboard,
  handleList,
  handleRead,
  handleCreate,
  handleUpdate,
  handleDelete,
} from './crud.ts';

// ─────────────────────────────────────────────────────────────
// Types - Handler configuration and request context
// ─────────────────────────────────────────────────────────────
export type {
  Handler,
  CmsOptions,
  CrudAction,
  FlashMessage,
  ParsedRoute,
  RouteContext,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// CSRF - Token generation and validation
// ─────────────────────────────────────────────────────────────
export {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfTokenFromFormData,
  getCsrfFieldName,
  generateCsrfSecret,
} from './csrf.ts';

// ─────────────────────────────────────────────────────────────
// Router - URL parsing and route generation
// ─────────────────────────────────────────────────────────────
export {
  parseRoute,
  resolveAction,
  cmsUrl,
  generateNavLinks,
  formatTableName,
  formatColumnName,
} from './router.ts';

// ─────────────────────────────────────────────────────────────
// Utils - Response helpers and form parsing
// ─────────────────────────────────────────────────────────────
export type { FlashCode } from './http.ts';

export {
  htmlResponse,
  jsonResponse,
  redirect,
  redirectWithFlash,
  parseFlashFromUrl,
  notFound,
  forbidden,
  methodNotAllowed,
  parseFormData,
  coerceFormValues,
  coerceValue,
  buildUrl,
  getPagination,
  getSort,
} from './http.ts';


/**
 * Create a CMS handler function
 * 
 * Returns a Web Standard Request → Response handler that can be used with:
 * - Deno.serve()
 * - Node.js 18+ with adapters
 * - Hono, Express, Oak, etc.
 * - Cloudflare Workers, Vercel Edge
 * 
 * @example
 * ```ts
 * import { createCmsHandler } from '@drizzle-cms/handlers';
 * import * as schema from './schema.ts';
 * 
 * const handler = createCmsHandler({
 *   db,
 *   schema,
 *   basePath: '/admin',
 * });
 * 
 * Deno.serve(handler);
 * ```
 */
export function createCmsHandler(options: CmsOptions): Handler {
  // Introspect schema if needed (check if it's already introspected)
  const isAlreadyIntrospected = 'tables' in options.schema && Array.isArray(options.schema.tables);
  const introspected = isAlreadyIntrospected 
    ? options.schema as unknown as import('@drizzle-cms/core').IntrospectedSchema
    : introspectFullSchema(options.schema);
  
  // Generate CSRF secret if not provided (won't survive restarts)
  const csrfSecret = options.csrfSecret ?? generateCsrfSecret();
  
  // Apply defaults
  const opts: ResolvedCmsOptions = {
    introspected,
    db: options.db,
    basePath: (options.basePath ?? '/admin').replace(/\/+$/, ''),
    title: options.title ?? 'CMS Admin',
    csrfSecret,
    isAuthenticated: options.isAuthenticated ?? (() => true),
    canAccess: options.canAccess ?? (() => true),
  };
  
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    
    // Parse the route
    const route = parseRoute(url, opts.basePath, opts.introspected.tables);
    
    // 404 if route doesn't match
    if (!route) {
      return notFound('Page not found');
    }
    
    // Resolve the action based on method
    const action = resolveAction(route, request.method);
    
    if (!action) {
      return methodNotAllowed(['GET', 'POST']);
    }
    
    // Check authentication
    const authenticated = await opts.isAuthenticated(request);
    if (!authenticated) {
      return forbidden('Authentication required');
    }
    
    // Check authorization for table actions
    if (route.table && action !== 'dashboard') {
      const authorized = await opts.canAccess(request, route.table, action);
      if (!authorized) {
        return forbidden('Access denied');
      }
    }
    
    // Build context
    const ctx: RouteContext = {
      request,
      options: opts,
      route,
      url,
    };
    
    // Dispatch to handler
    try {
      switch (action) {
        case 'dashboard':
          return handleDashboard(ctx);
        case 'list':
          return handleList(ctx);
        case 'read':
          return handleRead(ctx);
        case 'create':
          return handleCreate(ctx);
        case 'update':
          return handleUpdate(ctx);
        case 'delete':
          return handleDelete(ctx);
        default:
          return notFound('Unknown action');
      }
    } catch (error) {
      // Log unexpected errors for debugging
      console.error('CMS handler error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  };
}
