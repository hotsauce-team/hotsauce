# Benchmarks

hotsauce-cms ships a benchmark suite with two jobs:

1. **Showcase** — reproducible numbers for how fast the CMS handles real
   requests, tracked over time on the
   [trend chart](https://hotsauce-team.github.io/hotsauce/bench/).
2. **Regression prevention** — every PR gets a same-runner A/B comparison
   against its base commit, posted as a PR comment (see
   [`bench.yml`](.github/workflows/bench.yml)).

## Running locally

```sh
deno task bench          # human-readable results
deno task bench:json     # machine-readable (unstable deno format)
```

Benchmarks live in `packages/*/benches/*_bench.ts` and run with the
fine-grained permissions declared in the root `deno.jsonc` `bench` block.

## What is measured

### End-to-end handler benchmarks (the headline numbers)

`packages/cms/benches/handler_bench.ts` drives full
`Request → createCmsHandler → Response` cycles, including body consumption:
dashboard, list pages (25-row table, and default/100-row pages over a
1,000-row table), detail page, edit form, form-submit create, and a list
request through JWT auth plus row + column policies.

The database is an **in-memory SQLite** (`node:sqlite` behind Drizzle's
`sqlite-proxy` driver). That choice is deliberate:

- No external services and no wasm startup cost, so the numbers isolate CMS
  overhead — routing, auth, policies, validation, HTML rendering — on top of
  a real SQL engine executing real queries.
- It is **not** a Postgres round-trip. Production latency against a network
  database adds the database's own time on top of these numbers.

### Micro-benchmarks

Per-package hot paths, useful for pinpointing where a regression lives:

| Suite | File                                        | Covers                                                       |
| ----- | ------------------------------------------- | ------------------------------------------------------------ |
| core  | `packages/core/benches/introspect_bench.ts` | schema introspection, field mapping (cold-start floor)       |
| cms   | `packages/cms/benches/router_bench.ts`      | `parseRoute`, `resolveAction`, plugin route matching         |
| cms   | `packages/cms/benches/policies_bench.ts`    | policy WHERE building, per-row column filtering              |
| ui    | `packages/ui/benches/render_bench.ts`       | HTML escaping, list/grid view rendering at 25/100/1,000 rows |
| auth  | `packages/auth/benches/jwt_bench.ts`        | JWT sign/verify, cookie parsing                              |

## Sample numbers

Measured on an Apple M1 Pro, Deno 2.8.3, 2026-07-04 (see the
[trend chart](https://hotsauce-team.github.io/hotsauce/bench/) for current
CI numbers):

| Benchmark                                             | avg     | throughput    |
| ----------------------------------------------------- | ------- | ------------- |
| Full admin list page (25 rows), Request → Response    | ~290 µs | ~3,400 req/s  |
| Dashboard                                             | ~70 µs  | ~14,000 req/s |
| Detail page                                           | ~190 µs | ~5,200 req/s  |
| Create (form submit incl. CSRF + validation + insert) | ~340 µs | ~2,900 req/s  |
| List page with JWT auth + row/column policies         | ~510 µs | ~2,000 req/s  |
| Route parsing                                         | ~180 ns | —             |
| Full schema introspection (6 tables + relations)      | ~15 µs  | —             |

Single-threaded, sequential requests. Throughput is `1 / avg`, not a load
test.

## What is deliberately NOT benchmarked

- **PBKDF2 password hashing** — slow by design (~130 ms per hash); speed
  here would be a security bug, not a feature.
- **TOTP** — results depend on time windows, not code speed.
- **Worker/plugin startup** — dominated by process-spawn noise.
- **fs-storage / s3-storage plugins** — I/O- and environment-bound; wall
  clock measures the disk or network, not the code.

## CI regression policy

- **PRs** (`bench-pr` job): base and PR are benchmarked back-to-back on the
  same runner, and a bench is flagged only when **both avg and p75** are more
  than 25% slower — the dual criterion filters single-outlier flakes. The
  check is informational; setting the repo variable `BENCH_STRICT=true` makes
  flagged regressions fail the job.
- **main** (`bench-main` job): results are appended to the gh-pages trend
  chart on every push (and weekly), with an alert comment when a bench is
  50% slower than the previous main run.
