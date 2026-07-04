// Compare two `deno bench --json` runs (base vs PR) and emit a markdown
// report. Designed for same-runner A/B comparison in CI.
//
// Usage:
//   deno run --allow-read scripts/bench/compare.ts base.json pr.json \
//     [--threshold 1.25] [--fail]
//
// A bench counts as a REGRESSION only when BOTH avg and p75 exceed the
// threshold ratio — the dual criterion filters single-outlier flakes.
// Benches present on only one side are reported informationally, never
// failed. Exits non-zero only when regressions exist AND --fail is passed.

interface BenchStats {
  n: number;
  avg: number;
  p75: number;
}

interface BenchEntry {
  origin: string;
  group: string | null;
  name: string;
  results: Array<{ ok?: BenchStats }>;
}

function fail(message: string): never {
  console.error(`compare: ${message}`);
  Deno.exit(1);
}

/** Normalize origin to a checkout-independent key */
function originKey(origin: string): string {
  const match = origin.match(/packages\/.+$/);
  return match ? match[0] : origin;
}

function parseBenches(raw: string, label: string): Map<string, BenchStats> {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    fail(`${label}: not valid JSON`);
  }
  const benches = (doc as { benches?: unknown }).benches;
  if (!Array.isArray(benches)) {
    fail(`${label}: missing "benches" array (did \`deno bench --json\` change?)`);
  }
  const map = new Map<string, BenchStats>();
  for (const bench of benches as BenchEntry[]) {
    const ok = bench.results?.[0]?.ok;
    if (!ok || typeof ok.avg !== 'number' || typeof ok.p75 !== 'number') {
      continue;
    }
    const key = [originKey(bench.origin), bench.group ?? '', bench.name].join(
      '|',
    );
    map.set(key, ok);
  }
  return map;
}

function formatNs(ns: number): string {
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(2)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(1)} µs`;
  return `${ns.toFixed(0)} ns`;
}

function formatRatio(ratio: number): string {
  const pct = (ratio - 1) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function displayName(key: string): string {
  const [origin, group, name] = key.split('|');
  const pkg = origin?.match(/packages\/([^/]+)\//)?.[1] ?? origin;
  return [pkg, group, name].filter(Boolean).join(' / ');
}

if (import.meta.main) {
  const args = [...Deno.args];
  const failOnRegression = args.includes('--fail');
  let threshold = 1.25;
  const thresholdIdx = args.indexOf('--threshold');
  if (thresholdIdx !== -1) {
    threshold = Number(args[thresholdIdx + 1]);
    if (!Number.isFinite(threshold) || threshold <= 1) {
      fail('--threshold must be a number > 1');
    }
    args.splice(thresholdIdx, 2);
  }
  const files = args.filter((a) => a !== '--fail');
  const [baseFile, prFile] = files;
  if (!baseFile || !prFile) {
    fail('usage: compare.ts <base.json> <pr.json> [--threshold 1.25] [--fail]');
  }

  const base = parseBenches(Deno.readTextFileSync(baseFile), 'base');
  const pr = parseBenches(Deno.readTextFileSync(prFile), 'PR');

  const rows: string[] = [];
  const regressions: string[] = [];
  const improvements: string[] = [];
  const newBenches: string[] = [];
  const removedBenches: string[] = [];

  const keys = [...pr.keys()].sort();
  for (const key of keys) {
    const prStats = pr.get(key)!;
    const baseStats = base.get(key);
    const name = displayName(key);

    if (!baseStats) {
      newBenches.push(name);
      continue;
    }

    const avgRatio = prStats.avg / baseStats.avg;
    const p75Ratio = prStats.p75 / baseStats.p75;

    let status = '';
    if (avgRatio > threshold && p75Ratio > threshold) {
      status = '🔴 regression';
      regressions.push(name);
    } else if (avgRatio < 1 / threshold && p75Ratio < 1 / threshold) {
      status = '🟢 improvement';
      improvements.push(name);
    }

    rows.push(
      `| ${name} | ${formatNs(baseStats.avg)} | ${formatNs(prStats.avg)} | ${
        formatRatio(avgRatio)
      } | ${formatRatio(p75Ratio)} | ${status} |`,
    );
  }

  for (const key of base.keys()) {
    if (!pr.has(key)) removedBenches.push(displayName(key));
  }

  const lines: string[] = [];
  lines.push('## Benchmark comparison (base vs PR, same runner)');
  lines.push('');
  if (regressions.length > 0) {
    lines.push(
      `⚠️ **${regressions.length} possible regression(s)** — avg AND p75 both >${
        formatRatio(threshold)
      } slower than base:`,
    );
    for (const name of regressions) lines.push(`- ${name}`);
  } else {
    lines.push(
      `✅ No regressions (threshold: avg and p75 both >${
        formatRatio(threshold)
      }).`,
    );
  }
  if (improvements.length > 0) {
    lines.push('');
    lines.push(`🎉 ${improvements.length} improvement(s):`);
    for (const name of improvements) lines.push(`- ${name}`);
  }
  lines.push('');
  lines.push('<details><summary>Full results</summary>');
  lines.push('');
  lines.push('| Benchmark | base avg | PR avg | Δ avg | Δ p75 | |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  lines.push(...rows);
  lines.push('');
  lines.push('</details>');
  if (newBenches.length > 0) {
    lines.push('');
    lines.push(`New benches (no baseline): ${newBenches.join(', ')}`);
  }
  if (removedBenches.length > 0) {
    lines.push('');
    lines.push(`Removed benches: ${removedBenches.join(', ')}`);
  }

  console.log(lines.join('\n'));

  if (regressions.length > 0 && failOnRegression) {
    Deno.exit(1);
  }
}
