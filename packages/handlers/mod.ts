// @drizzle-cms/handlers
// CRUD route handlers using Web Standard Request/Response
// Works with Deno, Node 20+, Bun, Cloudflare Workers

import type {
  CmsOptions,
  Handler,
  ResolvedAuthOptions,
  ResolvedCmsOptions,
  RouteContext,
} from './types.ts';
import type { Policies } from './policies/types.ts';
import { introspectFullSchema } from '@drizzle-cms/core';
import { parseRoute, resolveAction } from './router.ts';
import {
  forbidden,
  methodNotAllowed,
  notFound,
  SECURITY_HEADERS,
} from './http.ts';
import { generateCsrfToken, validateCsrfToken } from './csrf.ts';
import { validateCmsOptions, validateResolvedSecrets } from './validation.ts';
import { getEnv } from './runtime-compat.ts';
import { createPluginRegistry } from './plugins/registry.ts';
import { createPluginService } from './plugins/service.ts';
import {
  handleCreate,
  handleDashboard,
  handleDelete,
  handleList,
  handleRead,
  handleUpdate,
} from './crud.ts';
import { handleStylesheet } from './styles.ts';
import { createJwtPayload, signJwt, verifyJwt } from './auth/jwt.ts';
import { renderLoginPage } from './auth/login.ts';
import {
  createAuthCookie,
  createClearCookie,
  getTokenFromCookies,
  isSecureRequest,
} from './auth/cookies.ts';
import type { JwtPayload } from './auth/jwt.ts';

// ─────────────────────────────────────────────────────────────
// Types - Handler configuration and request context
// ─────────────────────────────────────────────────────────────
export type {
  CmsAuthOptions,
  CmsOptions,
  CmsOptionsBase,
  CmsOptionsWithAuth,
  CmsOptionsWithoutAuth,
  CrudAction,
  ErrorContext,
  FlashMessage,
  Handler,
  ParsedRoute,
  ParserFn,
  Parsers,
  RouteContext,
  TableParsers,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Validation - Configuration validation (throws on invalid)
// ─────────────────────────────────────────────────────────────
export {
  CmsConfigError,
  CmsOptionsSchema,
  ResolvedSecretsSchema,
  validateCmsOptions,
  validateResolvedSecrets,
} from './validation.ts';

// ─────────────────────────────────────────────────────────────
// Form Validation - Zod-based form data validation
// ─────────────────────────────────────────────────────────────
export type { ValidationResult } from './crud-helpers.ts';
export {
  formatZodErrors,
  validateFormData,
  validateWithParsers,
} from './crud-helpers.ts';

// ─────────────────────────────────────────────────────────────
// CSRF - Token generation and validation
// ─────────────────────────────────────────────────────────────
export {
  generateCsrfToken,
  getCsrfFieldName,
  getCsrfTokenFromFormData,
  validateCsrfToken,
} from './csrf.ts';

// ─────────────────────────────────────────────────────────────
// Router - URL parsing and route generation
// ─────────────────────────────────────────────────────────────
export {
  cmsUrl,
  formatColumnName,
  formatTableName,
  generateNavLinks,
  parseRoute,
  resolveAction,
} from './router.ts';

// ─────────────────────────────────────────────────────────────
// Utils - Response helpers and form parsing
// ─────────────────────────────────────────────────────────────
export type { FlashCode } from './http.ts';

export {
  buildUrl,
  coerceFormValues,
  coerceValue,
  forbidden,
  getPagination,
  getSort,
  htmlResponse,
  jsonResponse,
  methodNotAllowed,
  notFound,
  parseFlashFromUrl,
  parseFormData,
  redirect,
  redirectWithFlash,
} from './http.ts';

// ─────────────────────────────────────────────────────────────
// Runtime - Cross-runtime utilities
// ─────────────────────────────────────────────────────────────
export { getEnv, requireEnv } from './runtime-compat.ts';

// ─────────────────────────────────────────────────────────────
// Styles - CSS stylesheet served as external file
// ─────────────────────────────────────────────────────────────
export { cmsStylesheet, cssResponse, handleStylesheet } from './styles.ts';

// ─────────────────────────────────────────────────────────────
// Policies - Row-level security for fine-grained authorization
// ─────────────────────────────────────────────────────────────
export type {
  ActionPolicies,
  Policies,
  Policy,
  PolicyApplicationResult,
  PolicyContext,
  PolicyFn,
  PolicyResult,
} from './policies/mod.ts';

export {
  adminOr,
  allOf,
  // Core helpers
  always,
  // Combining
  anyOf,
  // Application utilities
  applyPolicy,
  authenticated,
  createPolicyContext,
  // Action-specific
  forActions,
  never,
  // Ownership
  ownedBy,
  ownedByOrContributor,
  readOnly,
  roleIn,
  // Role-based
  roleIs,
} from './policies/mod.ts';

// ─────────────────────────────────────────────────────────────
// Plugins - Extensibility with Worker isolation
// ─────────────────────────────────────────────────────────────
export type {
  ActionContext,
  ActionHandlerFn,
  ActionHook,
  FilterContext,
  // Filter types
  HookType,
  InProcessPluginConfig,
  PluginCapabilities,
  PluginConfig,
  PluginContext,
  PluginFilter,
  PluginHooks,
  Serializable,
  TransformFn,
  WorkerPluginConfig,
} from './plugins/types.ts';

export { isWorkerPlugin } from './plugins/types.ts';

// ─────────────────────────────────────────────────────────────
// Auth - JWT authentication (optional)
// ─────────────────────────────────────────────────────────────
export type {
  AuthProvider,
  AuthUser,
  JwtPayload,
  PasswordCredentials,
  PasswordProviderOptions,
} from './auth/mod.ts';

export {
  createAuthCookie,
  createClearCookie,
  createJwtPayload,
  // Cookie utilities
  getTokenFromCookies,
  // Password hashing
  hashPassword,
  isSecureRequest,
  // Auth provider
  PasswordProvider,
  // JWT utilities
  signJwt,
  verifyJwt,
  verifyPassword,
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
/**
 * Global marker set on the main thread when CMS handler is created.
 * Used by worker guard to detect if code is running in main thread vs Worker.
 * Plugin authors: `if (globalThis.__CMS_MAIN_PROCESS__) throw new Error('Worker only');`
 */
declare global {
  // deno-lint-ignore no-var
  var __CMS_MAIN_PROCESS__: boolean | undefined;
}

export function createCmsHandler(options: CmsOptions): Handler {
  // Mark the main thread - Workers won't have this set
  globalThis.__CMS_MAIN_PROCESS__ = true;

  // Validate configuration (throws CmsConfigError on invalid)
  validateCmsOptions(options);

  // Check if using real auth or running dangerously open
  const hasRealAuth = options.auth !== 'dangerously-open';

  // Resolve secrets from options or environment variables, then validate
  const unresolvedAuthSecret = hasRealAuth
    ? (options.auth.secret || getEnv('CMS_JWT_SECRET'))
    : undefined;
  const unresolvedCsrfSecret = options.csrfSecret || getEnv('CMS_CSRF_SECRET');

  // Validate resolved secrets (after env var fallback) - returns typed values
  const { csrfSecret, authSecret: resolvedAuthSecret } =
    validateResolvedSecrets({
      csrfSecret: unresolvedCsrfSecret,
      authSecret: unresolvedAuthSecret,
    });

  // Introspect schema if needed (check if it's already introspected)
  const isAlreadyIntrospected = 'tables' in options.schema &&
    Array.isArray(options.schema.tables);
  const introspected = isAlreadyIntrospected
    ? options
      .schema as unknown as import('@drizzle-cms/core').IntrospectedSchema
    : introspectFullSchema(options.schema);

  // Resolve auth options if provided
  const resolvedAuth: ResolvedAuthOptions | undefined = hasRealAuth
    ? {
      secret: resolvedAuthSecret!,
      provider: options.auth.provider,
      maxAge: options.auth.maxAge ?? 8 * 60 * 60, // 8 hours
      cookieName: options.auth.cookieName ?? 'cms_token',
      loginTitle: options.auth.loginTitle ?? 'Admin Login',
      identityLabel: options.auth.identityLabel ?? 'Email',
      isRevoked: options.auth.isRevoked,
    }
    : undefined;

  // Resolve policies ('dangerously-open' = full access, undefined when auth is disabled)
  const resolvedPolicies: Policies | undefined =
    options.policies === 'dangerously-open' ? {} : options.policies;

  // Initialize plugin registry if plugins are configured
  const pluginRegistry = options.plugins && options.plugins.length > 0
    ? createPluginRegistry(options.plugins)
    : undefined;

  // Create plugin service (lazy initialization - Workers start on first use)
  const pluginService = createPluginService(pluginRegistry);

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
    policies: resolvedPolicies,
    auth: resolvedAuth,
    plugins: pluginRegistry,
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
    if (
      pathname === `${opts.basePath}/styles.css` && request.method === 'GET'
    ) {
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
            'Set-Cookie': createClearCookie(
              resolvedAuth.cookieName,
              opts.basePath,
            ),
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
          const user = await resolvedAuth.provider.authenticate({
            identity,
            password,
          });

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
          const payload = createJwtPayload(
            user.id,
            user.role,
            resolvedAuth.maxAge,
          );
          const token = await signJwt(payload, resolvedAuth.secret);
          const cookie = createAuthCookie(
            resolvedAuth.cookieName,
            token,
            resolvedAuth.maxAge,
            opts.basePath,
            isSecureRequest(request),
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
            opts.onError(error, {
              request,
              url,
              route: null,
              action: undefined,
            });
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
      authUser: jwtPayload
        ? { id: jwtPayload.sub, role: jwtPayload.role }
        : undefined,
      // Plugin service for executing hooks
      pluginService: pluginService ?? undefined,
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
