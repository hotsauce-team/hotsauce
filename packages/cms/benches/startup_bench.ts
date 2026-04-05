/**
 * Benchmarks for CMS handler cold-start cost.
 *
 * Compares fresh schema introspection (default path) vs
 * pre-introspected schema (serverless-optimised path).
 *
 * Run: deno bench packages/cms/benches/
 */

import { createCmsHandler } from '@hotsauce/cms';
import { introspectFullSchema } from '@hotsauce/core';
import * as schema from '../../core/tests/fixtures/schema-pg.ts';

const csrfSecret = 'bench-csrf-secret-must-be-at-least-32-chars!';

// ── Fresh schema (introspection happens inside createCmsHandler) ──

Deno.bench(
  'createCmsHandler — fresh schema (includes introspection)',
  () => {
    createCmsHandler({
      db: {},
      schema,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      csrfSecret,
    });
  },
);

// ── Pre-introspected schema (skip introspection at startup) ──

const preIntrospected = introspectFullSchema(schema);

Deno.bench(
  'createCmsHandler — pre-introspected schema (no introspection)',
  () => {
    createCmsHandler({
      db: {},
      schema: preIntrospected,
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      csrfSecret,
    });
  },
);
