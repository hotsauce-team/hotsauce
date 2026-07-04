// Micro-benchmarks: schema introspection and field mapping.
// These run at handler init (or per-request when uncached), so they set the
// cold-start floor for the CMS. Run with: deno task bench

import {
  introspectFullSchema,
  introspectTable,
  mapColumnsToFields,
} from '../mod.ts';
import * as schema from '../tests/fixtures/schema-pg.ts';
import { users } from '../tests/fixtures/schema-pg.ts';

const usersInfo = introspectTable(users);

Deno.bench('introspectFullSchema: blog schema (6 tables + relations)', () => {
  introspectFullSchema(schema);
});

Deno.bench('introspectTable: single table', () => {
  introspectTable(users);
});

Deno.bench('mapColumnsToFields: single table', () => {
  mapColumnsToFields(usersInfo.columns);
});
