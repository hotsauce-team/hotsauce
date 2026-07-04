// Convert `deno bench --json` output to github-action-benchmark's
// customSmallerIsBetter format.
//
// Usage:
//   deno bench -P --json > bench.json
//   deno run --allow-read scripts/bench/convert_gha.ts bench.json > gha.json
//
// NOTE: `deno bench --json` is marked unstable, so this parses defensively
// and fails loudly if the shape changes.

interface BenchResultOk {
  n: number;
  avg: number;
  p75: number;
  p99: number;
}

interface BenchEntry {
  origin: string;
  group: string | null;
  name: string;
  results: Array<{ ok?: BenchResultOk }>;
}

interface GhaEntry {
  name: string;
  unit: string;
  value: number;
  extra: string;
}

function fail(message: string): never {
  console.error(`convert_gha: ${message}`);
  Deno.exit(1);
}

/** Shorten a bench origin file URL to "package / file" */
export function shortOrigin(origin: string): string {
  const match = origin.match(/packages\/([^/]+)\/benches\/([^/]+)\.ts$/);
  if (match) return match[1]!;
  return origin.replace(/^file:\/\//, '');
}

export function convert(raw: string): GhaEntry[] {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    fail('input is not valid JSON');
  }

  const benches = (doc as { benches?: unknown }).benches;
  if (!Array.isArray(benches)) {
    fail('unexpected shape: missing "benches" array (did `deno bench --json` change?)');
  }

  const entries: GhaEntry[] = [];
  for (const bench of benches as BenchEntry[]) {
    if (typeof bench?.name !== 'string' || !Array.isArray(bench.results)) {
      fail(`unexpected bench entry shape: ${JSON.stringify(bench).slice(0, 200)}`);
    }
    const ok = bench.results[0]?.ok;
    if (!ok) continue; // skip failed benches; the bench run itself reports them
    if (typeof ok.avg !== 'number' || typeof ok.p75 !== 'number') {
      fail(`unexpected result shape for "${bench.name}"`);
    }
    const parts = [shortOrigin(bench.origin)];
    if (bench.group) parts.push(bench.group);
    parts.push(bench.name);
    entries.push({
      name: parts.join(' / '),
      unit: 'ns/iter',
      value: ok.avg,
      extra: `p75: ${ok.p75} ns, p99: ${ok.p99} ns, n: ${ok.n}`,
    });
  }

  if (entries.length === 0) {
    fail('no successful bench results found in input');
  }
  return entries;
}

if (import.meta.main) {
  const file = Deno.args[0];
  if (!file) fail('usage: convert_gha.ts <deno-bench-json-file>');
  const entries = convert(Deno.readTextFileSync(file));
  console.log(JSON.stringify(entries, null, 2));
}
