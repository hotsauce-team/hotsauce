// Rate-limit hint levels — request classification and the in-process channel.
// Design and rationale: ./DESIGN-rate-limit-hints.md
//
// The CMS never enforces rate limits; it labels routes so the integrator's
// infrastructure (proxy, CDN, or wrapping middleware) can. Level semantics:
// recommended throttle strictness, derived from two declared facts.

import type { IntrospectedTable } from '@hotsauce/core';
import type { PluginConfig } from './plugins/types.ts';
import { matchPluginRoute, parseRoute, resolveAction } from './router.ts';

/** Recommended throttle strictness. Absence (no header) means level 1. */
export type RateLimitLevel = 1 | 2 | 3;

/** Declared facts about a route; the level is derived from these. */
export interface RouteFacts {
  /**
   * The route responds differently to guessed secrets (login, TOTP codes,
   * password changes). Throttled for security regardless of cost.
   */
  bruteForceable: boolean;
  /**
   * The route consumes disproportionate CPU, bandwidth, storage, or
   * downstream quota per request. Throttled for capacity.
   */
  resourceIntensive: boolean;
}

/** Classification result exposed via {@link getRouteInfo} and the header. */
export interface RouteInfo extends RouteFacts {
  level: RateLimitLevel;
}

/**
 * The response header carrying the level when `rateLimitHints: 'header'`.
 *
 * This name and its values (`"1" | "2" | "3"`, absence = 1) are public API:
 * app authors may set the same header on routes served outside the CMS so
 * one proxy/middleware config covers both.
 */
export const RATE_LIMIT_LEVEL_HEADER = 'X-Rate-Limit-Level';

/** Derive the level from declared facts: bruteForceable→3, resourceIntensive→2, neither→1. */
export function deriveRateLimitLevel(
  facts: Partial<RouteFacts>,
): RateLimitLevel {
  if (facts.bruteForceable) return 3;
  if (facts.resourceIntensive) return 2;
  return 1;
}

function toInfo(
  facts: Partial<RouteFacts>,
  override?: RateLimitLevel,
): RouteInfo {
  return {
    bruteForceable: facts.bruteForceable ?? false,
    resourceIntensive: facts.resourceIntensive ?? false,
    level: override ?? deriveRateLimitLevel(facts),
  };
}

// ─────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────

/**
 * Built-in route classes. Closed union: adding a route class without facts
 * is a compile error (exhaustive switch below), and the classification test
 * asserts the expected level for every class.
 */
type RouteClass =
  | 'asset' // styles.css, admin.js, picker.js
  | 'login-page' // GET login form
  | 'login-submit' // POST login — password check AND TOTP phase 2
  | 'logout'
  | 'account-page' // GET account/password/2fa screens
  | 'account-submit' // POST password change, 2FA enable/disable
  | 'dashboard'
  | 'list'
  | 'record-page' // GET detail, create/edit forms
  | 'mutation-submit' // POST create/update/delete
  | 'file-serving' // {basePath}/files/... downloads
  | 'unmatched'; // no CMS route — level 1 baseline

function factsForClass(routeClass: RouteClass): Partial<RouteFacts> {
  switch (routeClass) {
    case 'login-submit':
    case 'account-submit':
      return { bruteForceable: true };
    case 'list':
    case 'mutation-submit':
    case 'file-serving':
      return { resourceIntensive: true };
    case 'asset':
    case 'login-page':
    case 'logout':
    case 'account-page':
    case 'dashboard':
    case 'record-page':
    case 'unmatched':
      return {};
  }
}

/** Context the classifier needs; all derived from the handler's own options. */
export interface ClassifyContext {
  /** Normalized base path (no trailing slash), e.g. '/admin' */
  basePath: string;
  tables: IntrospectedTable[];
  plugins: PluginConfig[];
}

/**
 * Classify a request into a {@link RouteInfo}. Reads only method + pathname —
 * deliberately no body, cookies, or auth — so it is safe and cheap to run
 * before anything else. Mirrors the handler's own dispatch order: assets and
 * auth/account paths, then built-in table routes, then plugin routes.
 */
export function classifyCmsRequest(
  request: Request,
  ctx: ClassifyContext,
): RouteInfo {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const base = ctx.basePath;

  if (
    pathname === `${base}/styles.css` || pathname === `${base}/admin.js` ||
    pathname === `${base}/picker.js`
  ) {
    return toInfo(factsForClass('asset'));
  }

  // Auth + account paths are classified whether or not auth is configured —
  // without auth these 404, and a strict label on a 404 is harmless.
  if (pathname === `${base}/login`) {
    return toInfo(
      factsForClass(method === 'POST' ? 'login-submit' : 'login-page'),
    );
  }
  if (pathname === `${base}/logout`) {
    return toInfo(factsForClass('logout'));
  }
  if (
    pathname === `${base}/account` || pathname.startsWith(`${base}/account/`)
  ) {
    return toInfo(
      factsForClass(method === 'POST' ? 'account-submit' : 'account-page'),
    );
  }

  if (pathname.startsWith(`${base}/files/`)) {
    return toInfo(factsForClass('file-serving'));
  }

  // Built-in table routes (take precedence over plugin routes, like dispatch)
  const route = parseRoute(url, base, ctx.tables);
  if (route) {
    const action = resolveAction(route, method);
    if (action === 'dashboard') return toInfo(factsForClass('dashboard'));
    if (action === 'list') return toInfo(factsForClass('list'));
    if (action === 'read') return toInfo(factsForClass('record-page'));
    if (action === 'create' || action === 'update' || action === 'delete') {
      return toInfo(
        factsForClass(method === 'POST' ? 'mutation-submit' : 'record-page'),
      );
    }
    return toInfo(factsForClass('unmatched'));
  }

  // Plugin routes: facts declared on the route; explicit rateLimitLevel wins.
  const pluginMatch = matchPluginRoute(url, base, method, ctx.plugins);
  if (pluginMatch) {
    return toInfo(pluginMatch.route, pluginMatch.route.rateLimitLevel);
  }

  return toInfo(factsForClass('unmatched'));
}

// ─────────────────────────────────────────────────────────────
// In-process channel (WeakMap accessor)
// ─────────────────────────────────────────────────────────────

// Keyed by Response identity; entries are garbage-collected with their
// Response. A cloned/reconstructed Response is a different object and will
// not be found — read RouteInfo in the wrapper that directly invokes the
// CMS handler, before caching middleware reconstructs the response.
const routeInfoMap = new WeakMap<Response, RouteInfo>();

// Misconfiguration guard state: warn once when the accessor is queried while
// every constructed handler has hints disabled. Three states so the
// lazy-loading pattern (CMS handler constructed on first admin request) never
// warns spuriously before any handler exists.
let anyEnabledHandler = false;
let anyDisabledHandler = false;
let warnedDisabled = false;

/** @internal Called by createCmsHandler to record its rateLimitHints mode. */
export function registerRateLimitHintsMode(enabled: boolean): void {
  if (enabled) anyEnabledHandler = true;
  else anyDisabledHandler = true;
}

/** @internal Called by the handler wrapper to populate the accessor. */
export function storeRouteInfo(response: Response, info: RouteInfo): void {
  routeInfoMap.set(response, info);
}

/**
 * Read the rate-limit classification of a Response produced by a CMS handler
 * constructed with `rateLimitHints: 'in-process'` or `'header'`.
 *
 * Returns `undefined` for responses the CMS did not produce (treat as level
 * 1), for cloned/reconstructed Responses, and when hints are disabled.
 */
export function getRouteInfo(response: Response): RouteInfo | undefined {
  const info = routeInfoMap.get(response);
  if (
    info === undefined && !anyEnabledHandler && anyDisabledHandler &&
    !warnedDisabled
  ) {
    warnedDisabled = true;
    // deno-lint-ignore no-console
    console.warn(
      '[@hotsauce/cms] getRouteInfo() was called, but every createCmsHandler() ' +
        "was constructed with rateLimitHints disabled. Pass rateLimitHints: 'in-process' " +
        "(or 'header') for the accessor to be populated.",
    );
  }
  return info;
}

/** @internal Test-only: reset the misconfiguration-guard state. */
export function _resetRateLimitHintsStateForTests(): void {
  anyEnabledHandler = false;
  anyDisabledHandler = false;
  warnedDisabled = false;
}
