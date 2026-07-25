# Design: rate-limit hint levels

Status: **implemented** (branch `rate-limit-hints`, 2026-07-25) — closes
[#43](https://github.com/hotsauce-team/hotsauce/issues/43) when merged.
Implementation: `packages/cms/rate-limit-hints.ts`, wired in
`packages/cms/mod.ts`; tests in
`packages/cms/tests/rate_limit_hints_test.ts`. Repo claims carry `path:line`
references; external claims were verified against vendor docs on 2026-07-25.

## Summary

The CMS computes a **rate-limit level (1–3)** per request — derived from
declared route facts — and exposes it through one tri-state option,
`rateLimitHints: false | 'in-process' | 'header'`, default `false`:

1. **`false` (default):** nothing — no classification computed, no WeakMap
   entry, no header. Off means the CMS does no work at all.
2. **`'in-process'`:** `getRouteInfo(response)` — a WeakMap-backed
   accessor. Nothing on the wire.
3. **`'header'`:** the accessor **plus** an `X-Rate-Limit-Level` response
   header for proxies and CDNs (a strict superset of `'in-process'`; the
   WeakMap entry is free once the level is computed).

The gating is a matter of principle, not cost: the per-request work when
enabled is one small allocation and a WeakMap set (~tens of ns, bounded by
responses in flight — invisible to the bench gate). "Off does nothing" is
simply a cleaner guarantee than invisible bookkeeping by default.

The CMS **never enforces** limits. Enforcement is the integrator's job — at
their edge (Fastly, HAProxy, Cloudflare) or in wrapping middleware (e.g. a
Redis-backed penalty box that reads the level and strips the header before
the response is served). This is the same division of labor as
`Cache-Control: no-store` on admin screens (commit 4892017): the CMS
declares per-response policy; infrastructure respects it. It replaces
documenting proxy rules that path-match `/admin/...` routes — coupling that
breaks on basePath changes and goes stale silently.

When `rateLimitHints` is off (the default), responses are byte-identical to
today.

## Level semantics: derived from facts, not asserted

Routes declare two boolean **facts**; the level is derived:

| `bruteForceable` | `resourceIntensive` | Level |
| ---------------- | ------------------- | ----- |
| true             | (any)               | 3     |
| false            | true                | 2     |
| false            | false               | 1     |

- **`bruteForceable`** — responds differently to guessed secrets (login,
  2FA codes). Throttled for security regardless of cost.
- **`resourceIntensive`** — consumes disproportionate CPU, bandwidth,
  storage, or downstream quota per request (large lists, uploads, presigns).
  Throttled for capacity.

Facts, not levels, are the authoring surface because plugin authors know
facts about their routes but are not positioned to set deployment policy —
and a reviewer can verify "this endpoint checks a six-digit code" where they
could only argue with a bare `3`. The integer remains the _consumption_
contract: proxies threshold on it, and (on Fastly) use it directly as a
counter weight.

Level means **recommended throttle strictness**, not cost — TOTP verify is
computationally cheap but needs the tightest limit; a 100-row list is the
reverse. Absent header ⇒ level 1. Three levels, deliberately: each maps to
a distinct documentable policy; finer scales invite unadjudicable review
debates.

### Built-in route classification

Internally the handler maps each route to a closed `RouteClass` union with
declared facts, so TypeScript exhaustiveness makes "class without facts" a
compile error:

| Route class                                       | Facts             | Level |
| ------------------------------------------------- | ----------------- | ----- |
| login POST (PBKDF2 ~130 ms by design), 2FA verify | bruteForceable    | 3     |
| list views, create/update/delete submits          | resourceIntensive | 2     |
| dashboard, detail/edit GET, login GET, logout     | —                 | 1     |

### Plugin routes

`PluginRoute` (`packages/workers/types.ts:462`) gains optional
`bruteForceable?: boolean` and `resourceIntensive?: boolean` — the same
declarative per-route metadata pattern as `csp` and `maxBodySize` — plus
`rateLimitLevel?: 1 | 2 | 3` as an explicit escape hatch that wins over the
derivation, for routes that don't decompose into the two facts. Registration
validation (`validatePlugin`, `packages/cms/plugins/registry.ts:182`)
rejects out-of-range levels. Undeclared ⇒ level 1.

First-party declarations: s3-storage presign POST → `resourceIntensive`
(SigV4 signing + object-store cost amplification — the subject of #43;
level 2, since the route is already authenticated and policy-checked);
fs-storage upload and download/signed-URL routes → `resourceIntensive`;
puck editor routes → undeclared (1).

### App-defined routes (outside the CMS)

Routes the app serves itself (frontend pages, its own APIs) never pass
through `createCmsHandler`, so they carry no header and no WeakMap entry —
and by the absence-means-level-1 rule they **default to level 1 on both
channels with no work from anyone**. Proxies act only on `>= 2`;
middleware treats `getRouteInfo(res) === undefined` as "not mine, level
1". App routes are not a gap.

For app routes that deserve a level (public form POSTs, search endpoints —
the app has its own `bruteForceable`/`resourceIntensive` candidates), the
**wire contract is public API**: header name `X-Rate-Limit-Level`, values
`"1" | "2" | "3"`, absence = 1, facts→level table above. An app author
sets the header on their own responses
(`res.headers.set('X-Rate-Limit-Level', '3')`) and every downstream
consumer — the proxy recipes, penalty-box middleware reading the header —
covers CMS and app routes with one config. Two documented caveats:
hand-typed header names drift (docs show the exact string; a future helper
removes the risk — see Deferred), and app-set headers don't populate the
WeakMap, so accessor-based middleware needs a header fallback for non-CMS
responses (or classifies its own routes directly — the app is not a black
box to itself).

## API surface

```ts
// Handler option — default false: no classification, no WeakMap, no header
createCmsHandler({ rateLimitHints: 'in-process' }); // accessor only
createCmsHandler({ rateLimitHints: 'header' }); // accessor + wire header

// In-process accessor — populated only when rateLimitHints is enabled
import { getRouteInfo } from '@hotsauce/cms';
const info = getRouteInfo(response);
// { level: 1|2|3, bruteForceable: boolean, resourceIntensive: boolean } | undefined
```

**Footgun and its mitigation:** with hints disabled, `getRouteInfo`
returns `undefined` — indistinguishable from "not a CMS response" — so
misconfigured enforcement middleware fails silently open. Mitigation: a
one-time `console.warn` from the accessor itself. The module tracks three
states — no handler constructed yet / a handler with hints enabled exists /
handlers exist but all have hints disabled — and warns (once) only in the
third state. No synthetic requests, no cold-start cost, no side effects;
the warning fires on the first real request through the misconfigured
path. The three-state check keeps the lazy-loading pattern quiet
(`apps/www` constructs the CMS handler on first admin hit; until then the
accessor legitimately returns `undefined` without warning). Rejected
alternative: a boot-time synthetic request through the handler —
per-cold-start cost on serverless, and it can trigger lazy init (DB, plugin
workers) earlier than the app intends. If the module-level state is deemed
too magic, docs-only is the acceptable fallback.

No emit modes, no configurable header name, no override callback in v1 —
see Deferred.

### Implementation shape

One choke point, not per-response-site instrumentation (there are dozens of
`new Response(...)` sites in `packages/cms/mod.ts`). At the top of the
returned fetch handler, **only when `rateLimitHints` is enabled**: derive
`RouteInfo` from method + pathname (the route parsing the handler performs
anyway; auth paths via the same `${basePath}/login` logic,
`packages/cms/mod.ts:1060`), run the inner dispatch, then:

- `routeInfoMap.set(response, info)` — a module-private
  `WeakMap<Response, RouteInfo>`. WeakMap because: no mutation of the
  platform Response (Web-Standard-APIs discipline that the dnt build
  depends on); entries are garbage-collected with their Response, so there
  is no leak and no eviction code; access only via the exported accessor.
  Lookup is by object identity — a cloned or reconstructed Response
  (`new Response(body, res)`) is not a key, so the documented rule is:
  **call `getRouteInfo` in the wrapper that directly invokes the CMS
  handler**, before caching middleware reconstructs the response.
  `undefined` means "not a CMS response — treat as level 1".
- If `rateLimitHints` is `'header'`, also set the `X-Rate-Limit-Level`
  header.

Cost when off (default): one option check — no allocation, no WeakMap
entry, no header. Cost when enabled: one small allocation + WeakMap set
(and, for `'header'`, one header set) — invisible against the ~70–510 µs
request budgets and the >25% CI bench gate
(`.github/workflows/bench.yml`).

## Consumption recipes (documentation, not code we ship)

No proxy natively consumes any rate-limit header — there is no standard
name to be compatible with (the IETF `RateLimit-*` fields describe quota to
_clients_; nothing enforces from them). Both Fastly and HAProxy read
arbitrary response headers and drive their primitives from them, so
`X-Rate-Limit-Level` is purely our contract, referenced by name in the
integrator's config. The recipes below are the integration; docs must ship
them complete (declarations included) and flagged "verify against your
proxy version".

**In-app (Redis penalty box), read-then-strip.** Requires
`rateLimitHints: 'in-process'` (or `'header'`). Wrapping middleware calls
the CMS handler; on the way out reads `getRouteInfo(res)` (or the header),
increments a per-client counter weighted by level in Redis/memory, strips
the header (constructed-Response headers are mutable:
`res.headers.delete(...)`), and returns. Requests from clients over budget
are rejected 429 _before_ invoking the handler on subsequent requests.
Reactive by design (penalty box): an abuser gets threshold-N full-cost
requests before the box closes — acceptable for the actual threats
(credential stuffing, presign farming), which are sustained by nature.
In-memory counters are valid only for single-isolate deployments; note that
`deno serve --parallel` already means multiple isolates.

**Fastly (Edge Rate Limiting — paid entitlement).** Verified against Fastly
docs 2026-07-25: `ratelimit.check_rate(entry, rc, delta, window, limit, pb,
ttl)` with window ∈ {1, 10, 60}s and penalty TTL 1m–1h; available in all
subroutines, so it may run in `vcl_fetch` where origin response headers are
visible. Requires top-level `ratecounter` and `penaltybox` declarations.
The level works directly as the `delta` — weighted budget, one counter.
Cache hits never reach `vcl_fetch`, so the counter naturally measures
origin work only. Strip in `vcl_deliver` (`unset resp.http.X-Rate-Limit-Level`).

**HAProxy.** Stick table storing `gpc0,gpc0_rate(60s)`; `http-request
track-sc0 src`; `http-response sc-inc-gpc0(0) if { res.hdr(X-Rate-Limit-Level)
-m str 3 }`; `http-request deny deny_status 429 if { sc0_gpc0_rate gt N }`;
`http-response del-header X-Rate-Limit-Level`. Note: `sc-inc-gpc0`
increments by 1 — no weighted delta; count level-3 only, or use one counter
per level. Stick tables replicate via peers (clustered enforcement).

**Stripping** is the integrator's responsibility, in whichever layer
consumes the header; docs include the one-line check
(`curl -sI https://site/admin/login | grep -i x-rate-limit` → empty).
In-app consumers can avoid the header entirely by using the accessor in
`'in-process'` mode.

## Testing

New `packages/cms/rate_limit_hints_test.ts` under normal `deno task test`:

1. **Exhaustive classification** — handler with a representative schema and
   all first-party plugins; enumerate every declared route (auth paths,
   CRUD actions, all plugin routes) and assert facts + derived level
   against a literal expected table. An unclassified new route is a red PR.
2. **E2E header assertions** — hints on: login GET → 1, login POST → 3,
   list → 2, presign → 2, etc.
3. **Default-off regression** — hints absent ⇒ header absent AND
   `getRouteInfo` returns `undefined` on every route class (the
   does-nothing guarantee).
4. **Accessor** — under `'in-process'`: populated, no header emitted;
   under `'header'`: `getRouteInfo(res).level` equals the header value
   (the two channels can never drift); `undefined` for a cloned Response
   (documents the identity caveat); warns once — and only once — when
   queried while all constructed handlers have hints disabled.
5. **Plugin validation** — out-of-range `rateLimitLevel` rejected;
   escape hatch wins over derived facts.
6. **Node parity** — one smoke assertion in `npm-tests/cms.test.js`
   (login POST → `x-rate-limit-level: 3`). No new package, so only the
   node-compat test file changes.

## Documentation (closes #43)

Same PR as the feature:

- `packages/plugins/s3-storage/README.md` — `### Rate Limiting` under
  `## Security`: presign as cost amplification; primary guidance = throttle
  on the header/accessor; the three recipes above in brief; illustrative
  quotas consistent with SECURITY.md's list.
- `packages/cms/README.md:1426` — extend the login-scoped
  `### Rate Limiting` with the option, the accessor, read-then-strip, the
  **public wire contract** (exact header name, values, absence = 1, the
  facts→level table — so app authors can label their own routes), and one
  blunt sentence: _the CMS never enforces limits; it labels routes._
- `SECURITY.md:413` — presign line in the recommended-limits list +
  header reference. (Issue #43's triage cites `SECURITY.md:272`; the
  section has moved to `:413`.)

## Non-goals

- No enforcement in the CMS — no counters, no state, no 429s. The CMS
  cannot see deployment topology and must not own `X-Forwarded-For` trust.
- No measured/dynamic cost (latency-based tagging flaps on GC noise).
- No client-facing IETF `RateLimit-*` headers — different audience.
- No per-user/per-session levels; classification sees method + path only.

## Deferred (compatible later — all are projections of the same RouteInfo)

- **Standalone classifier** (`createRateLimitClassifier(options)`) for
  pre-execution rejection on long-lived servers. Rejected for v1 as
  duplicate machinery; the penalty-box model doesn't need it. If demanded,
  prefer this over an `onRouteClassified` handler callback — a
  short-circuiting callback inside the handler inverts control, becomes a
  one-hook middleware framework, and even observe-only variants invite
  abort-by-throwing.
- **Manifest generator** (`route-levels.json` from app config) — the only
  projection that makes serverless/edge economic sense (pre-invocation
  enforcement from platform rules; in-process anything still bills per
  invocation) and doubles as a golden-file test fixture. Add when an edge
  deployment exists.
- **`emit: 'when-requested'`** (header only when the proxy sends a trigger
  header) — structural strip guarantee; add if accidental exposure proves
  to be a real problem.
- **`setRouteInfo(response, facts)` helper for app-defined routes** — runs
  the same facts→level derivation, populates the WeakMap, and sets the
  header, so app routes join both channels with no hand-typed header names.
  Deferred because rung 1 (the public wire contract) already lets app
  routes participate; add when demand shows the drift/fallback caveats
  bite in practice.
- **Integrator override callback** and configurable header name.

## References

- Route parsing: `packages/cms/router.ts:128` (`parseRoute`), `:200`
  (`resolveAction`); login path handling `packages/cms/mod.ts:1060`
- Plugin route metadata precedent: `packages/workers/types.ts:462`
  (`csp`, `maxBodySize`); validation `packages/cms/plugins/registry.ts:182`
- Existing rate-limit docs: `packages/cms/README.md:1426`
  (`withRateLimiter` at `:1436`), `SECURITY.md:413`
- Cache-Control precedent: commits 4892017, 6a25512
- Budgets/bench gate: BENCHMARKS.md; `.github/workflows/bench.yml`
- Fastly (verified 2026-07-25):
  [ratelimit.check_rate](https://www.fastly.com/documentation/reference/vcl/functions/rate-limiting/ratelimit-check-rate/),
  [penaltybox declaration](https://www.fastly.com/documentation/reference/vcl/declarations/penaltybox/),
  [rate limiting concepts](https://www.fastly.com/documentation/guides/concepts/rate-limiting/)
- Issue:
  [hotsauce-team/hotsauce#43](https://github.com/hotsauce-team/hotsauce/issues/43)
