/**
 * CMS E2E test with PGlite (in-memory Postgres)
 *
 * Tests the full CRUD flow: list → create → read → update → delete
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';

import {
  createCmsHandler,
  getRouteInfo,
  RATE_LIMIT_LEVEL_HEADER,
} from '@hotsauce/cms';
import * as schema from './schema.js';

describe('@hotsauce/cms CRUD', () => {
  let db;
  let pglite;
  let cmsHandler;

  before(async () => {
    // Setup in-memory Postgres
    pglite = new PGlite();
    db = drizzle(pglite);

    // Create tables (PGlite requires separate statements)
    await db.execute(
      sql`CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived')`,
    );

    await db.execute(sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        bio TEXT,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        slug VARCHAR(200) NOT NULL UNIQUE,
        body TEXT,
        status post_status NOT NULL DEFAULT 'draft',
        author_id INTEGER NOT NULL REFERENCES users(id),
        published_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Create CMS handler (dangerously-open bypasses auth but still needs csrf)
    cmsHandler = createCmsHandler({
      db,
      schema: { users: schema.users, posts: schema.posts },
      basePath: '/admin',
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      csrfSecret: 'test-csrf-secret-at-least-32-chars!',
    });
  });

  after(async () => {
    await pglite?.close();
  });

  // Helper to make requests
  const request = (method, path, body = null) => {
    const url = `http://localhost/admin${path}`;
    const options = { method, headers: {} };

    if (body) {
      if (body instanceof URLSearchParams) {
        options.body = body.toString();
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const req = new Request(url, options);
    return cmsHandler(req);
  };

  it('shows empty list initially', async () => {
    const res = await request('GET', '/users');
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('users'));
  });

  it('creates a user via form POST', async () => {
    // Get the create form to extract CSRF and source tokens
    const formRes = await request('GET', '/users/new');
    assert.equal(formRes.status, 200);
    const formHtml = await formRes.text();

    // Extract CSRF token
    const csrfMatch = formHtml.match(/name="__cms_csrf"\s+value="([^"]+)"/);
    assert.ok(csrfMatch, 'CSRF token not found in form');
    const csrfToken = csrfMatch[1];

    // Extract source token (required for write operations)
    const sourceMatch = formHtml.match(/name="__cms_source"\s+value="([^"]+)"/);
    assert.ok(sourceMatch, 'Source token not found in form');
    const sourceToken = sourceMatch[1];

    // Submit form
    const form = new URLSearchParams({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
      email: 'test@example.com',
      name: 'Test User',
      bio: 'A test user',
      is_admin: 'false',
    });

    const createRes = await request('POST', '/users/new', form);
    // Should redirect to list or detail
    assert.ok([200, 302, 303].includes(createRes.status));
  });

  it('reads the created user', async () => {
    const res = await request('GET', '/users/1');
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('test@example.com') || html.includes('Test User'));
  });

  it('lists the user', async () => {
    const res = await request('GET', '/users');
    assert.equal(res.status, 200);

    const html = await res.text();
    assert.ok(html.includes('Test User') || html.includes('test@example.com'));
  });

  it('updates the user', async () => {
    // Get edit form
    const formRes = await request('GET', '/users/1/edit');
    assert.equal(formRes.status, 200);
    const formHtml = await formRes.text();

    const csrfMatch = formHtml.match(/name="__cms_csrf"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch[1];

    // Extract source token (required for write operations)
    const sourceMatch = formHtml.match(/name="__cms_source"\s+value="([^"]+)"/);
    const sourceToken = sourceMatch[1];

    // Submit update
    const form = new URLSearchParams({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
      email: 'updated@example.com',
      name: 'Updated User',
      bio: 'Updated bio',
      is_admin: 'true',
    });

    const updateRes = await request('POST', '/users/1/edit', form);
    assert.ok([200, 302, 303].includes(updateRes.status));
  });

  it('deletes the user', async () => {
    // CMS uses POST to /users/1/delete with CSRF and source tokens
    // Get a fresh CSRF token from the edit page
    const editRes = await request('GET', '/users/1/edit');
    const editHtml = await editRes.text();
    const csrfMatch = editHtml.match(/name="__cms_csrf"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch[1];
    const sourceMatch = editHtml.match(/name="__cms_source"\s+value="([^"]+)"/);
    const sourceToken = sourceMatch[1];

    const form = new URLSearchParams({
      __cms_csrf: csrfToken,
      __cms_source: sourceToken,
    });
    const deleteRes = await request('POST', '/users/1/delete', form);
    assert.ok(
      [200, 302, 303].includes(deleteRes.status),
      `Expected redirect, got ${deleteRes.status}`,
    );

    // Verify deleted
    const readRes = await request('GET', '/users/1');
    assert.equal(readRes.status, 404);
  });
});

describe('@hotsauce/cms rate-limit hints', () => {
  let pglite;
  let handler;

  before(async () => {
    pglite = new PGlite();
    const db = drizzle(pglite, { schema });

    await db.execute(sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        bio TEXT,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    handler = createCmsHandler({
      db,
      schema: { users: schema.users },
      basePath: '/admin',
      auth: 'dangerously-open',
      policies: 'dangerously-open',
      csrfSecret: 'test-csrf-secret-at-least-32-chars!',
      rateLimitHints: 'header',
    });
  });

  after(async () => {
    await pglite?.close();
  });

  it('labels login POST level 3 and list level 2', async () => {
    const loginRes = await handler(
      new Request('http://localhost/admin/login', { method: 'POST' }),
    );
    assert.equal(loginRes.headers.get(RATE_LIMIT_LEVEL_HEADER), '3');

    const listRes = await handler(new Request('http://localhost/admin/users'));
    assert.equal(listRes.status, 200);
    assert.equal(listRes.headers.get(RATE_LIMIT_LEVEL_HEADER), '2');
    assert.equal(getRouteInfo(listRes)?.level, 2);
  });
});
