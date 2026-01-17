// @drizzle-cms/handlers
// CRUD route handlers using Web Standard Request/Response
// Works with Deno, Node 20+, Bun, Cloudflare Workers

import type { CmsOptions, ResolvedCmsOptions, ResolvedAuthOptions, RouteContext, Handler } from './types.ts';
import { introspectFullSchema } from '@drizzle-cms/core';
import { parseRoute, resolveAction } from './router.ts';
import { notFound, forbidden, methodNotAllowed, SECURITY_HEADERS } from './http.ts';
import { generateCsrfToken, validateCsrfToken } from './csrf.ts';
import { validateCmsOptions } from './validation.ts';
import { getEnv } from './runtime-compat.ts';
import {
  handleDashboard,
  handleList,
  handleRead,
  handleCreate,
  handleUpdate,
  handleDelete,
} from './crud.ts';
import { handleStylesheet } from './styles.ts';
import { signJwt, verifyJwt, createJwtPayload } from './auth/jwt.ts';
import { renderLoginPage } from './auth/login.ts';
import { getTokenFromCookies, createAuthCookie, createClearCookie, isSecureRequest } from './auth/cookies.ts';
import type { JwtPayload } from './auth/jwt.ts';

// ─────────────────────────────────────────────────────────────
// Types - Handler configuration and request context
// ─────────────────────────────────────────────────────────────
export type {
  Handler,
  CmsOptions,
  CmsAuthOptions,
  CrudAction,
  ErrorContext,
  FlashMessage,
  ParsedRoute,
  RouteContext,
  ParserFn,
  TableParsers,
  Parsers,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Validation - Configuration validation (throws on invalid)
// ─────────────────────────────────────────────────────────────
export { validateCmsOptions, CmsConfigError, CmsOptionsSchema } from './validation.ts';

// ─────────────────────────────────────────────────────────────
// Form Validation - Zod-based form data validation
// ─────────────────────────────────────────────────────────────
export type { ValidationResult } from './crud-helpers.ts';
export { validateFormData, validateWithParsers, formatZodErrors } from './crud-helpers.ts';

// ─────────────────────────────────────────────────────────────
// CSRF - Token generation and validation
// ─────────────────────────────────────────────────────────────
export {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfTokenFromFormData,
  getCsrfFieldName,
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

// ─────────────────────────────────────────────────────────────
// Runtime - Cross-runtime utilities
// ─────────────────────────────────────────────────────────────
export { getEnv, requireEnv } from './runtime-compat.ts';

// ─────────────────────────────────────────────────────────────
// Styles - CSS stylesheet served as external file
// ─────────────────────────────────────────────────────────────
export { cmsStylesheet, handleStylesheet, cssResponse } from './styles.ts';

// ─────────────────────────────────────────────────────────────
// Auth - JWT authentication (optional)
// ─────────────────────────────────────────────────────────────
export type {
  JwtPayload,
  AuthUser,
  AuthProvider,
  PasswordCredentials,
  PasswordProviderOptions,
} from './auth/mod.ts';

export {
  // JWT utilities
  signJwt,
  verifyJwt,
  createJwtPayload,
  // Password hashing
  hashPassword,
  verifyPassword,
  // Auth provider
  PasswordProvider,
  // Cookie utilities
  getTokenFromCookies,
  createAuthCookie,
  createClearCookie,
  isSecureRequest,
} from './auth/mod.ts';


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
 * 
 * @example With authentication
 * ```ts
 * import { createCmsHandler, PasswordProvider } from '@drizzle-cms/handlers';
 * 
 * const handler = createCmsHandler({
 *   db,
 *   schema,
 *   basePath: '/admin',
 *   auth: {
 *     secret: process.env.JWT_SECRET!,
 *     provider: new PasswordProvider({
 *       db,
 *       usersTable: schema.adminUsers,
 *       identityField: 'email',
 *       passwordField: 'passwordHash',
 *     }),
 *   },
 * });
 * ```
 */
export function createCmsHandler(options: CmsOptions): Handler {
  // Validate configuration (throws CmsConfigError on invalid)
  validateCmsOptions(options);
  
  // Validate auth options if provided
  let resolvedAuthSecret: string | undefined;
  if (options.auth) {
    // Resolve auth secret from options or environment
    resolvedAuthSecret = options.auth.secret || getEnv('CMS_JWT_SECRET');
    if (!resolvedAuthSecret) {
      throw new Error(
        'auth.secret is required. Either pass it directly or set CMS_JWT_SECRET environment variable.'
      );
    }
    if (resolvedAuthSecret.length < 32) {
      throw new Error('auth.secret must be at least 32 characters');
    }
    if (!options.auth.provider) {
      throw new Error('auth.provider is required when auth is configured');
    }
  }
  
  // Introspect schema if needed (check if it's already introspected)
  const isAlreadyIntrospected = 'tables' in options.schema && Array.isArray(options.schema.tables);
  const introspected = isAlreadyIntrospected 
    ? options.schema as unknown as import('@drizzle-cms/core').IntrospectedSchema
    : introspectFullSchema(options.schema);
  
  // Resolve CSRF secret from options or environment
  const csrfSecret = options.csrfSecret || getEnv('CMS_CSRF_SECRET');
  if (!csrfSecret) {
    throw new Error(
      'csrfSecret is required. Either pass it directly or set CMS_CSRF_SECRET environment variable. ' +
      'Generate one with: openssl rand -base64 32'
    );
  }
  
  // Resolve auth options if provided
  const resolvedAuth: ResolvedAuthOptions | undefined = options.auth ? {
    secret: resolvedAuthSecret!,
    provider: options.auth.provider,
    maxAge: options.auth.maxAge ?? 8 * 60 * 60, // 8 hours
    cookieName: options.auth.cookieName ?? 'cms_token',
    loginTitle: options.auth.loginTitle ?? 'Admin Login',
    identityLabel: options.auth.identityLabel ?? 'Email',
    isRevoked: options.auth.isRevoked,
  } : undefined;
  
  // Apply defaults
  const opts: ResolvedCmsOptions = {
    introspected,
    db: options.db,
    basePath: (options.basePath ?? '/admin').replace(/\/+$/, ''),
    title: options.title ?? 'CMS Admin',
    csrfSecret,
    isAuthenticated: options.isAuthenticated ?? (() => true),
    canAccess: options.canAccess ?? (() => true),
    onError: options.onError,
    parsers: options.parsers ?? {},
    auth: resolvedAuth,
  };
  
  // Helper to check if request accepts JSON
  const wantsJson = (request: Request): boolean => {
    const accept = request.headers.get('Accept') ?? '';
    return accept.includes('application/json');
  };
  
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    
    // JWT payload for authenticated user (set when auth is enabled)
    let jwtPayload: JwtPayload | null = null;
    
    // Serve stylesheet at {basePath}/styles.css
    if (pathname === `${opts.basePath}/styles.css` && request.method === 'GET') {
      return handleStylesheet();
    }
    
    // ─────────────────────────────────────────────────────────────
    // Auth routes (when auth is configured)
    // ─────────────────────────────────────────────────────────────
    if (resolvedAuth) {
      const loginPath = `${opts.basePath}/login`;
      const logoutPath = `${opts.basePath}/logout`;
      
      // Handle logout (POST only to prevent CSRF)
      if (pathname === logoutPath && request.method === 'POST') {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': loginPath,
            'Set-Cookie': createClearCookie(resolvedAuth.cookieName, opts.basePath),
            ...SECURITY_HEADERS,
          },
        });
      }
      
      // Handle login page (GET)
      if (pathname === loginPath && request.method === 'GET') {
        const csrfToken = await generateCsrfToken(csrfSecret);
        const html = renderLoginPage({
          basePath: opts.basePath,
          title: resolvedAuth.loginTitle,
          identityLabel: resolvedAuth.identityLabel,
          csrfToken,
        });
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...SECURITY_HEADERS,
          },
        });
      }
      
      // Handle login submission (POST)
      if (pathname === loginPath && request.method === 'POST') {
        try {
          const formData = await request.formData();
          
          // Validate CSRF token
          const csrfToken = formData.get('_csrf') as string | null;
          const identity = formData.get('identity') as string | null;
          if (!await validateCsrfToken(csrfToken, csrfSecret)) {
            const newCsrfToken = await generateCsrfToken(csrfSecret);
            const html = renderLoginPage({
              basePath: opts.basePath,
              title: resolvedAuth.loginTitle,
              identityLabel: resolvedAuth.identityLabel,
              identityValue: identity ?? '',
              csrfToken: newCsrfToken,
              error: 'Your session has expired. Please try again.',
            });
            return new Response(html, {
              status: 403,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                ...SECURITY_HEADERS,
              },
            });
          }
          
          // Parse credentials from form data (identity already extracted above for CSRF error case)
          const password = formData.get('password') as string | null;
          
          // Validate required fields
          if (!identity || !password) {
            const newCsrfToken = await generateCsrfToken(csrfSecret);
            const html = renderLoginPage({
              basePath: opts.basePath,
              title: resolvedAuth.loginTitle,
              identityLabel: resolvedAuth.identityLabel,
              identityValue: identity ?? '',
              csrfToken: newCsrfToken,
              error: 'Please enter your email and password.',
            });
            return new Response(html, {
              status: 400,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                ...SECURITY_HEADERS,
              },
            });
          }
          
          // Authenticate
          const user = await resolvedAuth.provider.authenticate({ identity, password });
          
          if (!user) {
            const newCsrfToken = await generateCsrfToken(csrfSecret);
            const html = renderLoginPage({
              basePath: opts.basePath,
              title: resolvedAuth.loginTitle,
              identityLabel: resolvedAuth.identityLabel,
              identityValue: identity ?? '',
              csrfToken: newCsrfToken,
              error: 'Invalid email or password.',
            });
            return new Response(html, {
              status: 401,
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                ...SECURITY_HEADERS,
              },
            });
          }
          
          // Create JWT and set auth cookie
          const payload = createJwtPayload(user.id, user.role, resolvedAuth.maxAge);
          const token = await signJwt(payload, resolvedAuth.secret);
          const cookie = createAuthCookie(
            resolvedAuth.cookieName,
            token,
            resolvedAuth.maxAge,
            opts.basePath,
            isSecureRequest(request)
          );
          
          return new Response(null, {
            status: 302,
            headers: {
              'Location': opts.basePath,
              'Set-Cookie': cookie,
              ...SECURITY_HEADERS,
            },
          });
        } catch (err) {
          // Log the error if handler provided
          if (opts.onError) {
            const error = err instanceof Error ? err : new Error(String(err));
            opts.onError(error, { request, url, route: null, action: undefined });
          }
          
          const newCsrfToken = await generateCsrfToken(csrfSecret);
          const html = renderLoginPage({
            basePath: opts.basePath,
            title: resolvedAuth.loginTitle,
            identityLabel: resolvedAuth.identityLabel,
            csrfToken: newCsrfToken,
            error: 'An unexpected error occurred. Please try again.',
          });
          return new Response(html, {
            status: 500,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              ...SECURITY_HEADERS,
            },
          });
        }
      }
      
      // ─────────────────────────────────────────────────────────────
      // Validate JWT for all other routes
      // ─────────────────────────────────────────────────────────────
      const token = getTokenFromCookies(request, resolvedAuth.cookieName);
      
      if (token) {
        jwtPayload = await verifyJwt(token, resolvedAuth.secret);
        
        // Check if revoked
        if (jwtPayload && resolvedAuth.isRevoked) {
          const revoked = await resolvedAuth.isRevoked(jwtPayload);
          if (revoked) {
            jwtPayload = null;
          }
        }
      }
      
      // Redirect to login if not authenticated
      if (!jwtPayload) {
        if (wantsJson(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...SECURITY_HEADERS,
            },
          });
        }
        return new Response(null, {
          status: 302,
          headers: {
            'Location': loginPath,
            ...SECURITY_HEADERS,
          },
        });
      }
    }
    
    // ─────────────────────────────────────────────────────────────
    // Regular CMS routes
    // ─────────────────────────────────────────────────────────────
    
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
    
    // Check authentication (only if auth is not configured - auth handles it above)
    if (!resolvedAuth) {
      const authenticated = await opts.isAuthenticated(request);
      if (!authenticated) {
        return forbidden('Authentication required');
      }
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
      // Include auth user if authenticated via JWT
      authUser: jwtPayload ? { id: jwtPayload.sub, role: jwtPayload.role } : undefined,
    };
    
    // Dispatch to handler
    try {
      switch (action) {
        case 'dashboard':
          return await handleDashboard(ctx);
        case 'list':
          return await handleList(ctx);
        case 'read':
          return await handleRead(ctx);
        case 'create':
          return await handleCreate(ctx);
        case 'update':
          return await handleUpdate(ctx);
        case 'delete':
          return await handleDelete(ctx);
        default:
          return notFound('Unknown action');
      }
    } catch (err) {
      // Normalize to Error (handles thrown strings, objects, etc.)
      const error = err instanceof Error ? err : new Error(String(err));
      
      // Call user's error handler if provided
      if (opts.onError) {
        opts.onError(error, {
          request,
          url,
          route,
          table: route.table ?? undefined,
          action,
        });
      }
      return new Response('Internal Server Error', { 
        status: 500,
        headers: SECURITY_HEADERS,
      });
    }
  };
}
