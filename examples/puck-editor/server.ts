// Server entry point
// CMS admin with Puck editor plugin - frontend rendering TBD (React)
// deno-lint-ignore-file no-console

import { Hono } from 'hono';
import { db } from './db.ts';
import { createAdminHandler } from './admin/admin.ts';

// ─────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────

const app = new Hono();

// CMS admin routes (/admin/*)
const cmsHandler = createAdminHandler(db);
app.all('/admin/*', (c) => cmsHandler(c.req.raw));
app.all('/admin', (c) => cmsHandler(c.req.raw));

// Homepage redirect to admin
app.get('/', (c) => c.redirect('/admin'));

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

const PORT = 3000;

console.log(`🚀 Server running at http://localhost:${PORT}`);
console.log(`📝 CMS admin at http://localhost:${PORT}/admin`);
console.log(`   Run 'deno task seed' first to set up the database`);

Deno.serve({ port: PORT, hostname: '127.0.0.1' }, app.fetch);
