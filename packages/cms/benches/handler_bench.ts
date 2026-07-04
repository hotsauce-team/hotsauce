// End-to-end handler benchmarks: full Request → Response cycles through
// createCmsHandler, including body consumption. These are the headline
// numbers — see BENCHMARKS.md for methodology. Run with: deno task bench

import {
  createCmsHandler,
  createJwtPayload,
  ownedBy,
  signJwt,
} from '../mod.ts';
import type { Handler } from '../types.ts';
import { PasswordProvider } from '@hotsauce/auth';
import { generateCsrfToken } from '../csrf.ts';
import { generateSourceToken, SOURCE } from '../tokens/source.ts';
import {
  adminUsers,
  BENCH_AUTH_SECRET,
  BENCH_CSRF_SECRET,
  createBenchDb,
  posts,
  schema,
  seedData,
} from './bench_helpers.ts';

const { sqlite, db } = createBenchDb();
seedData(sqlite, { users: 25, posts: 1000 });
const SEEDED_POSTS = 1000;

// Pure-speed path: no auth, no policies.
const openHandler = createCmsHandler({
  csrfSecret: BENCH_CSRF_SECRET,
  db,
  schema,
  basePath: '/admin',
  auth: 'dangerously-open',
  policies: 'dangerously-open',
});

// Honest-overhead path: JWT auth plus row + column policies on posts.
const policyHandler = createCmsHandler({
  csrfSecret: BENCH_CSRF_SECRET,
  db,
  schema,
  basePath: '/admin',
  auth: {
    secret: BENCH_AUTH_SECRET,
    provider: new PasswordProvider({ db, usersTable: adminUsers }),
  },
  policies: {
    posts: {
      row: ownedBy(posts, 'authorId'),
      columns: {
        body: { read: () => false },
      },
    },
  },
});

const authCookie = `cms_token=${await signJwt(
  createJwtPayload('1'),
  BENCH_AUTH_SECRET,
)}`;

function getRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

// Pre-flight: fail loudly at load time if any benched route errors, so the
// benchmarks can never silently measure error pages.
async function preflight(
  handler: Handler,
  request: Request,
  maxStatus = 299,
): Promise<void> {
  const response = await handler(request);
  const body = await response.text();
  if (response.status > maxStatus) {
    throw new Error(
      `Pre-flight failed: ${request.method} ${request.url} → ${response.status}\n${
        body.slice(0, 500)
      }`,
    );
  }
}

await preflight(openHandler, getRequest('/admin'));
await preflight(openHandler, getRequest('/admin/users'));
await preflight(openHandler, getRequest('/admin/posts'));
await preflight(openHandler, getRequest('/admin/posts?limit=100'));
await preflight(openHandler, getRequest('/admin/posts/1'));
await preflight(openHandler, getRequest('/admin/posts/1/edit'));
await preflight(
  policyHandler,
  getRequest('/admin/posts', { headers: { Cookie: authCookie } }),
);

Deno.bench('e2e: GET /admin — dashboard', async () => {
  const res = await openHandler(getRequest('/admin'));
  await res.text();
});

Deno.bench(
  'e2e: GET /admin/users — list page (25-row table)',
  { group: 'e2e list page', baseline: true },
  async () => {
    const res = await openHandler(getRequest('/admin/users'));
    await res.text();
  },
);

Deno.bench(
  'e2e: GET /admin/posts — default page of 25 (1,000-row table)',
  { group: 'e2e list page' },
  async () => {
    const res = await openHandler(getRequest('/admin/posts'));
    await res.text();
  },
);

Deno.bench(
  'e2e: GET /admin/posts?limit=100 — page of 100 (1,000-row table)',
  { group: 'e2e list page' },
  async () => {
    const res = await openHandler(getRequest('/admin/posts?limit=100'));
    await res.text();
  },
);

Deno.bench('e2e: GET /admin/posts/1 — detail page', async () => {
  const res = await openHandler(getRequest('/admin/posts/1'));
  await res.text();
});

Deno.bench('e2e: GET /admin/posts/1/edit — edit form', async () => {
  const res = await openHandler(getRequest('/admin/posts/1/edit'));
  await res.text();
});

Deno.bench(
  'e2e: GET /admin/posts — list with JWT auth + row/column policies',
  async () => {
    const res = await policyHandler(
      getRequest('/admin/posts', { headers: { Cookie: authCookie } }),
    );
    await res.text();
  },
);

// Create measures only the handler call (b.start/b.end); token generation
// happens before the timer and cleanup after, so the table never grows
// across iterations.
const deleteCreated = sqlite.prepare('DELETE FROM posts WHERE id > ?');

Deno.bench('e2e: POST /admin/posts/new — create (form submit)', async (b) => {
  const csrfToken = await generateCsrfToken(BENCH_CSRF_SECRET);
  const sourceToken = await generateSourceToken(SOURCE.CMS, BENCH_CSRF_SECRET);
  const form = new FormData();
  form.append('title', 'Bench post');
  form.append('body', 'Created during a benchmark iteration.');
  form.append('authorId', '1');
  form.append('__cms_csrf', csrfToken);
  form.append('__cms_source', sourceToken);
  const request = getRequest('/admin/posts/new', {
    method: 'POST',
    body: form,
  });

  b.start();
  const res = await openHandler(request);
  await res.text();
  b.end();

  if (res.status >= 400) {
    throw new Error(`create failed with status ${res.status}`);
  }
  deleteCreated.run(SEEDED_POSTS);
});
