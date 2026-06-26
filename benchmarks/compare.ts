// Compares two `deno bench --json` outputs (baseline = main, current = PR) and
// renders a compact markdown table of the per-benchmark deltas.
//
// Usage:
//   deno run --allow-read benchmarks/compare.ts <baseline.json> <current.json> [thresholdPct]
//
// - Prints the markdown table to stdout (captured by the benchmark workflow and
//   posted as a PR comment).
// - Exits non-zero if any benchmark is more than `thresholdPct` slower than the
//   baseline. The workflow uses this both to flag regressions and to gate a
//   confirmation re-run before failing the check.

interface BenchResult {
  ok?: { avg: number };
  failed?: unknown;
}

interface Bench {
  name: string;
  group?: string;
  results: BenchResult[];
}

interface BenchFile {
  benches: Bench[];
}

const DEFAULT_THRESHOLD_PCT = 10;

const encoder = new TextEncoder();
function writeLine(stream: typeof Deno.stdout | typeof Deno.stderr, s: string) {
  stream.writeSync(encoder.encode(s + '\n'));
}

function avgFor(bench: Bench): number | null {
  const ok = bench.results.find((r) => r.ok)?.ok;
  return ok ? ok.avg : null;
}

// Nanoseconds -> human-readable string, matching deno bench's own units.
function formatTime(ns: number): string {
  if (ns < 1_000) return `${ns.toFixed(1)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)} µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  return `${(ns / 1_000_000_000).toFixed(2)} s`;
}

async function readBenches(path: string): Promise<Map<string, number>> {
  const data = JSON.parse(await Deno.readTextFile(path)) as BenchFile;
  const map = new Map<string, number>();
  for (const bench of data.benches ?? []) {
    const avg = avgFor(bench);
    if (avg !== null) map.set(bench.name, avg);
  }
  return map;
}

async function run(args: string[]): Promise<number> {
  const [baselinePath, currentPath, thresholdArg] = args;
  if (!baselinePath || !currentPath) {
    writeLine(
      Deno.stderr,
      'Usage: compare.ts <baseline.json> <current.json> [thresholdPct]',
    );
    return 2;
  }
  const threshold = thresholdArg !== undefined
    ? Number(thresholdArg)
    : DEFAULT_THRESHOLD_PCT;

  const [baseline, current] = await Promise.all([
    readBenches(baselinePath),
    readBenches(currentPath),
  ]);

  // Stable ordering: baseline order first, then any current-only benches.
  const names = [
    ...baseline.keys(),
    ...[...current.keys()].filter((n) => !baseline.has(n)),
  ];

  const rows: string[] = [];
  const regressions: string[] = [];

  for (const name of names) {
    const base = baseline.get(name);
    const cur = current.get(name);

    if (base === undefined) {
      rows.push(`| ${name} | — | ${formatTime(cur!)} | new |`);
      continue;
    }
    if (cur === undefined) {
      rows.push(`| ${name} | ${formatTime(base)} | — | removed |`);
      continue;
    }

    const pct = ((cur - base) / base) * 100;
    const sign = pct >= 0 ? '+' : '';
    const regressed = pct > threshold;
    const marker = regressed ? ' ⚠️' : '';
    rows.push(
      `| ${name} | ${formatTime(base)} | ${formatTime(cur)} | ${sign}${
        pct.toFixed(1)
      }%${marker} |`,
    );
    if (regressed) {
      regressions.push(`${name} (${sign}${pct.toFixed(1)}%)`);
    }
  }

  const lines = [
    '### Benchmark results',
    '',
    `Comparing PR against \`main\` (same runner). Regression threshold: **${threshold}%** slower.`,
    '',
    '| Benchmark | main | PR | Δ |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ];

  if (regressions.length > 0) {
    lines.push(`⚠️ **Possible regression:** ${regressions.join(', ')}`);
  } else {
    lines.push('✅ No regressions over threshold.');
  }

  writeLine(Deno.stdout, lines.join('\n'));
  return regressions.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  Deno.exit(await run(Deno.args));
}
