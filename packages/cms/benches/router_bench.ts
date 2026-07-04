// Micro-benchmarks: URL routing and dispatch — runs on every request.
// Run with: deno task bench

import { introspectSchema } from '@hotsauce/core';
import * as schema from '../../core/tests/fixtures/schema-pg.ts';
import { matchPluginRoute, parseRoute, resolveAction } from '../router.ts';
import type { PluginConfig } from '../plugins/types.ts';

const tables = introspectSchema(schema);
const basePath = '/admin';

const listUrl = new URL('http://localhost/admin/posts');
const detailUrl = new URL('http://localhost/admin/posts/42');
const editUrl = new URL('http://localhost/admin/posts/42/edit');
const missUrl = new URL('http://localhost/admin/no_such_table');

Deno.bench('parseRoute: list URL', () => {
  parseRoute(listUrl, basePath, tables);
});

Deno.bench('parseRoute: detail URL', () => {
  parseRoute(detailUrl, basePath, tables);
});

Deno.bench('parseRoute: edit URL', () => {
  parseRoute(editUrl, basePath, tables);
});

Deno.bench('parseRoute: unknown table (404)', () => {
  parseRoute(missUrl, basePath, tables);
});

const listRoute = parseRoute(listUrl, basePath, tables)!;

Deno.bench('resolveAction: GET list', () => {
  resolveAction(listRoute, 'GET');
});

// 4 plugins × 5 routes = 20 registered routes; the match hits the last
// route of the last plugin, so this measures the worst-case scan.
const plugins: PluginConfig[] = Array.from({ length: 4 }, (_, p) => ({
  name: `plugin${p}`,
  routes: Array.from({ length: 5 }, (_, r) => ({
    pattern: `:table/:id/route${r}`,
    methods: ['GET' as const],
    handler: () => new Response('ok'),
  })),
}));
const pluginUrl = new URL('http://localhost/admin/plugin3/posts/1/route4');

Deno.bench('matchPluginRoute: 20 routes, match last', () => {
  matchPluginRoute(pluginUrl, basePath, 'GET', plugins);
});
