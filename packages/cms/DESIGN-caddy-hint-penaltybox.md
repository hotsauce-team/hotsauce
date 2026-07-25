# Handover: `caddy-hint-penaltybox` Caddy module

Status: **handover — not started.** This document briefs the developer who
will implement the module. It is the Caddy counterpart to the HAProxy and
Fastly consumption recipes for the CMS's rate-limit hint header — read
[DESIGN-rate-limit-hints.md](./DESIGN-rate-limit-hints.md) first; this doc
assumes its wire contract. External vendor facts below were verified
2026-07-25 (Fastly) or follow HAProxy's stable stick-table config surface.

## Why this module exists

The CMS labels responses with `X-Rate-Limit-Level: 1|2|3` (absence = 1) —
recommended throttle strictness, never enforcement. HAProxy and Fastly can
consume that header with **built-in primitives** (stick tables; Edge Rate
Limiting). Caddy cannot: it has no scripting runtime (no Lua/njs
equivalent), and `mholt/caddy-ratelimit` is request-side only — its
matchers and zone keys cannot see an **origin response** header. Caddy's
extension mechanism is a compiled-in Go module, so response-header-driven
rate limiting for Caddy _is_ a small custom module. That module is this
project.

Deliberate consequence for documentation: the module implements the **same
penalty-box pattern** as the HAProxy and Fastly recipes, with deliberately
parallel vocabulary, so its README can say "if you know Fastly's penalty
boxes or HAProxy's stick tables, you already understand this" and link to
their docs as conceptual references.

## The pattern (identical across all three)

1. **Response phase (counting):** read the hint level off each origin
   response; accumulate a _weighted_ budget per client (weight = level, so
   a level-3 login attempt costs 3 units, level-1 traffic costs nothing
   worth tracking).
2. **Penalty (boxing):** when a client's budget over a sliding window
   crosses the limit, put the client in a penalty box for a TTL.
3. **Request phase (enforcement):** requests from boxed clients are
   rejected with 429 + `Retry-After` _before_ reaching the origin.
4. **Hygiene:** strip the header before the response reaches the client.

Reactive by design: an abuser gets budget-worth of full-cost requests
before the box closes. That is the accepted trade of the whole hint
design (sustained abuse — credential stuffing, presign farming — is the
threat, not first-hit).

## Concept map: Fastly ↔ HAProxy ↔ this module

| Concept            | Fastly ERL                                 | HAProxy                                       | `caddy-hint-penaltybox`             |
| ------------------ | ------------------------------------------ | --------------------------------------------- | ----------------------------------- |
| Per-client counter | `ratecounter` declaration                  | stick-table `store gpc0,gpc0_rate(60s)`       | in-memory sliding-window counter    |
| Count on response  | `ratelimit.check_rate(...)` in `vcl_fetch` | `http-response sc-inc-gpc0(0) if { ... }`     | ResponseWriter shim after `next`    |
| Weighted increment | `delta` parameter = level                  | not supported (increments by 1)               | `delta = level` (Fastly-style)      |
| Penalty box        | `penaltybox` declaration + TTL             | modeled via rate threshold on the table       | boxed map with per-entry TTL        |
| Enforce on request | `ratelimit.penaltybox_has()` in `vcl_recv` | `http-request deny if { sc0_gpc0_rate gt N }` | box check at top of `ServeHTTP`     |
| Client key         | `client.ip` (or any entry string)          | `track-sc0 src`                               | `{client_ip}` placeholder (default) |
| Strip the header   | `unset resp.http.X-Rate-Limit-Level`       | `http-response del-header`                    | module strips by default            |
| Window constraint  | 1, 10, or 60 seconds                       | arbitrary `gpc0_rate(period)`                 | configurable; default 60s           |
| Penalty TTL        | 1m–1h, minute granularity                  | table `expire`                                | configurable; default 5m            |
| Clustered state    | platform-global                            | stick-table peers protocol                    | **out of scope v1** (see Non-goals) |

Reference implementations of the other two columns (keep these in the
module README so users can cross-check): the Fastly VCL and HAProxy
snippets in
[DESIGN-rate-limit-hints.md → Consumption recipes](./DESIGN-rate-limit-hints.md#consumption-recipes-documentation-not-code-we-ship).

## Behavior specification (normative)

- **Request phase.** Resolve the client key. If the key is in the penalty
  box and not expired → respond `429` with `Retry-After: <remaining box
  seconds>` and do not call the next handler. Otherwise pass through.
- **Response phase.** After the upstream handler runs, read the configured
  header from the response. Parse strictly: `"1"`, `"2"`, `"3"`. Absent
  header, or any other value → treat as level 1 (contract: absence = 1;
  garbage must not crash or count). If level ≥ `min_level`, add `level`
  units to the client's sliding-window counter. If the window total
  crosses `limit`, insert the key into the penalty box with `penalty_ttl`.
- **Stripping.** When `strip` is on (default), remove the header before it
  is written to the client — including on counted, uncounted, and 429
  responses. Note the Caddy-specific trap below.
- **Key resolution.** Default `{client_ip}` — Caddy's placeholder that
  respects the server's `trusted_proxies` configuration. Do NOT default to
  a raw `X-Forwarded-For` read; XFF trust is the server config's job, same
  as the CMS refuses to own it.
- **Memory bounds.** Hard cap on tracked keys (default e.g. 100k) with
  expiry sweep + oldest-first eviction. An attacker rotating IPs must
  exhaust the cap into evictions, not into unbounded memory.
- **Level-1 traffic** must cost near-zero: no counter allocation for keys
  that have only ever produced level-1 responses.

## Proposed Caddyfile surface

Parameter names deliberately echo Fastly's (`window`, `limit`,
`penalty_ttl` ≈ `check_rate(entry, rc, delta, window, limit, pb, ttl)`):

```caddyfile
example.com {
  route {
    hint_penaltybox {
      header      X-Rate-Limit-Level  # default; the CMS contract
      key         {client_ip}         # default
      min_level   2                   # ignore level-1 responses
      window      60s                 # sliding window (Fastly allows 1|10|60s)
      limit       30                  # weighted units per window before boxing
      penalty_ttl 5m                  # Fastly allows 1m–1h; mirror that range in docs
      strip       true                # default
      status      429                 # default
    }
    reverse_proxy localhost:8000
  }
}
```

JSON config mirrors the same fields under `http.handlers.hint_penaltybox`.

## Implementation guidance

- **Repo:** `hotsauce-team/caddy-hint-penaltybox` (own repo — it's a Go
  module built with `xcaddy build --with ...`, not part of the Deno
  monorepo). MIT/Apache-2.0 to match Caddy ecosystem norms.
- **Module shape:** `http.handlers` namespace; implement
  `caddy.Module`, `caddy.Provisioner`, `caddyhttp.MiddlewareHandler`,
  `caddyfile.Unmarshaler`. See
  [Extending Caddy](https://caddyserver.com/docs/extending-caddy) and
  `mholt/caddy-ratelimit` as the closest prior art (its sliding-window
  internals are worth reading; its request-side-only design is the gap
  this module fills).
- **Reading the response header — the one Caddy-specific trap.** Response
  headers must be inspected _before_ they are flushed to the client, or
  stripping is impossible. Wrap the ResponseWriter and hook
  `WriteHeader`: read + strip the hint header there, then delegate. Do not
  buffer bodies (`_serve` streams files); header-time interception only.
- **State:** per-instance, in-memory. Sharded `map[string]*counter` with
  per-shard mutexes (or `sync.Map` if contention proves fine); ring-buffer
  or bucketed sliding window like caddy-ratelimit's; monotonic clock via
  `time.Since`. Penalty box is a `map[string]time.Time` (expiry) behind
  the same shards. Background sweep on a ticker registered in `Provision`,
  stopped in `Cleanup`.
- **`Retry-After`** = ceiling of remaining box TTL in seconds, not the
  configured TTL (a client probing mid-box gets an honest number).

## Testing (acceptance criteria)

Unit tests: weighted window arithmetic (3+3+... crosses limit where 1s
don't), box expiry, strict level parsing (absent/garbage/`"0"`/`"4"` → 1),
eviction under key-cap pressure.

Integration (Caddy's `caddytest` harness) against a stub upstream that
returns configurable hint headers:

1. Level-3 responses at limit+1 weighted units within the window → next
   request 429 with `Retry-After`; after `penalty_ttl` elapses → allowed.
2. Level-1-only traffic never boxes and never allocates counters.
3. The hint header never reaches the client in any scenario (counted,
   ignored, boxed) while `strip true`.
4. Two clients (distinct keys): boxing one does not affect the other.
5. Overhead sanity: request-phase check on unboxed key is O(1) and
   allocation-free (benchmark, not a hard gate).

End-to-end smoke against the real CMS: `deno task` app with
`rateLimitHints: 'header'` behind an xcaddy build; hammer
`POST /admin/login`; observe boxing. (The www app on the
`rate-limit-hints` branch is already configured for this.)

## README requirements (for module users)

The README must let a Caddy user understand the module through the other
vendors' documentation — that is a stated product goal, not nice-to-have:

- Open with the pattern in one paragraph and the concept-map table above.
- Link the analogues: Fastly
  [`ratelimit.check_rate`](https://www.fastly.com/documentation/reference/vcl/functions/rate-limiting/ratelimit-check-rate/),
  [`penaltybox`](https://www.fastly.com/documentation/reference/vcl/declarations/penaltybox/),
  [rate-limiting concepts](https://www.fastly.com/documentation/guides/concepts/rate-limiting/);
  HAProxy stick tables ([docs.haproxy.org](https://docs.haproxy.org/) —
  `stick-table`, `http-response sc-inc-gpc0`, `sc0_gpc0_rate`).
- State the wire contract it consumes (`X-Rate-Limit-Level`, values
  `"1"|"2"|"3"`, absence = 1) and link the CMS docs; note any app can emit
  the same header — the module is not HotSauce-specific.
- State the reactive trade-off plainly (budget-worth of requests before
  boxing) and the per-instance state limitation.
- `xcaddy` build one-liner + minimal Caddyfile.

## Non-goals (v1)

- **No distributed state.** Multi-instance Caddy means per-instance
  budgets (N instances ≈ N× the threshold). Future: sync via Caddy
  storage the way caddy-ratelimit's distributed mode does — design the
  counter store behind a small interface so this can be added without
  breaking config.
- **No request-side classification** (no path rules, no manifest reading).
  Pre-origin first-hit enforcement is the `forward_auth`/manifest path,
  a separate project.
- **No allow/deny lists, no WAF ambitions.** One pattern, done well.
- **No config pushed from the app.** The app labels; the operator decides
  budgets.

## Open questions for the implementer

1. Should `window` be clamped to Fastly's {1, 10, 60}s for doc parity, or
   free-form with those as documented conventions? (Lean: free-form,
   document the convention.)
2. Box re-offense policy: does traffic during the box extend the TTL
   (Fastly: no; HAProxy: effectively yes while the rate stays high)?
   Pick one, document it in the concept map.
3. Expose Prometheus metrics (`boxed_total`, `weighted_units_total`) via
   Caddy's metrics registry in v1, or defer?

## References

- Wire contract + sibling recipes:
  [DESIGN-rate-limit-hints.md](./DESIGN-rate-limit-hints.md)
- Fastly (verified 2026-07-25):
  [check_rate](https://www.fastly.com/documentation/reference/vcl/functions/rate-limiting/ratelimit-check-rate/),
  [penaltybox_has](https://www.fastly.com/documentation/reference/vcl/functions/rate-limiting/ratelimit-penaltybox-has/),
  [penaltybox declaration](https://www.fastly.com/documentation/reference/vcl/declarations/penaltybox/)
- Caddy: [Extending Caddy](https://caddyserver.com/docs/extending-caddy),
  [mholt/caddy-ratelimit](https://github.com/mholt/caddy-ratelimit)
  (prior art; request-side only),
  [xcaddy](https://github.com/caddyserver/xcaddy)
- HAProxy: [docs.haproxy.org](https://docs.haproxy.org/) (stick tables,
  general-purpose counters)
