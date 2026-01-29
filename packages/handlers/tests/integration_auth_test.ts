// JWT Auth Integration Tests
// Tests authentication flows with real database

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  adminUsers,
  AUTH_SECRET,
  createAdminUsersTable,
  createBasicTables,
  createFormData,
  schemaWithAuth,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import { hashPassword, PasswordProvider } from '../auth/mod.ts';

Deno.test('integration: JWT auth tests', async (t) => {
  // Create single PGlite instance for all auth tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWithAuth });

  // Create tables once
  await createBasicTables(db);
  await createAdminUsersTable(db);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users RESTART IDENTITY CASCADE`,
    );
  }

  // Helper to create handler with auth
  function createAuthHandler(extraOptions = {}) {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWithAuth,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new PasswordProvider({
          db,
          usersTable: adminUsers,
          identityField: 'email',
          passwordField: 'passwordHash',
          roleField: 'role',
        }),
      },
      policies: 'dangerously-open',
      ...extraOptions,
    });
  }

  await t.step('redirects unauthenticated to login', async () => {
    await resetDb();
    const handler = createAuthHandler();

    const request = new Request('http://localhost/admin');
    const response = await handler(request);

    assertEquals(response.status, 302);
    assertEquals(response.headers.get('Location'), '/admin/login');
  });

  await t.step('login page renders', async () => {
    const handler = createAuthHandler();

    const request = new Request('http://localhost/admin/login');
    const response = await handler(request);

    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get('Content-Type'),
      'text/html; charset=utf-8',
    );

    const html = await response.text();
    assertStringIncludes(html, 'form');
    assertStringIncludes(html, 'identity');
    assertStringIncludes(html, 'password');
    assertStringIncludes(html, '_csrf');
  });

  await t.step('successful login with correct credentials', async () => {
    await resetDb();

    const passwordHash = await hashPassword('admin123');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Get CSRF token from login page
    const loginPageReq = new Request('http://localhost/admin/login');
    const loginPageRes = await handler(loginPageReq);
    const loginHtml = await loginPageRes.text();

    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    assertExists(csrfMatch, 'CSRF token should be in login page');
    const csrfToken = csrfMatch[1]!;

    // Submit login
    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'admin123',
      _csrf: csrfToken,
    });

    const loginReq = new Request('http://localhost/admin/login', {
      method: 'POST',
      body: formData,
    });
    const loginRes = await handler(loginReq);

    assertEquals(loginRes.status, 302);
    assertEquals(loginRes.headers.get('Location'), '/admin');

    const setCookie = loginRes.headers.get('Set-Cookie');
    assertExists(setCookie, 'Set-Cookie header should be present');
    assertStringIncludes(setCookie, 'cms_token=');
    assertStringIncludes(setCookie, 'HttpOnly');
  });

  await t.step('rejects invalid password', async () => {
    await resetDb();

    const passwordHash = await hashPassword('correct-password');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Get CSRF token
    const loginPageRes = await handler(
      new Request('http://localhost/admin/login'),
    );
    const loginHtml = await loginPageRes.text();
    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch![1]!;

    // Submit with wrong password
    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'wrong-password',
      _csrf: csrfToken,
    });

    const loginReq = new Request('http://localhost/admin/login', {
      method: 'POST',
      body: formData,
    });
    const loginRes = await handler(loginReq);

    assertEquals(loginRes.status, 401);
    const html = await loginRes.text();
    assertStringIncludes(html, 'Invalid email or password');
  });

  await t.step('allows access with valid token', async () => {
    await resetDb();

    const passwordHash = await hashPassword('admin123');
    await db.insert(adminUsers).values({
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
    });

    const handler = createAuthHandler();

    // Login to get token
    const loginPageRes = await handler(
      new Request('http://localhost/admin/login'),
    );
    const loginHtml = await loginPageRes.text();
    const csrfMatch = loginHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken = csrfMatch![1]!;

    const formData = createFormData({
      identity: 'admin@example.com',
      password: 'admin123',
      _csrf: csrfToken,
    });

    const loginRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: formData,
      }),
    );

    // Extract token from Set-Cookie
    const setCookie = loginRes.headers.get('Set-Cookie')!;
    const tokenMatch = setCookie.match(/cms_token=([^;]+)/);
    assertExists(tokenMatch, 'Token should be in Set-Cookie');
    const token = tokenMatch[1];

    // Access dashboard with token
    const dashboardReq = new Request('http://localhost/admin', {
      headers: { 'Cookie': `cms_token=${token}` },
    });
    const dashboardRes = await handler(dashboardReq);

    assertEquals(dashboardRes.status, 200);
    const html = await dashboardRes.text();
    assertStringIncludes(html, 'users');
  });

  // Cleanup
  await client.close();
});
