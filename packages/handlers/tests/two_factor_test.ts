// Two-Factor Authentication Integration Tests
// Tests full 2FA login flow with real database

import { assertEquals, assertExists, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';
import {
  AUTH_SECRET,
  createBasicTables,
  createFormData,
  schema,
  TEST_CSRF_SECRET,
} from './integration_helpers.ts';
import { createCmsHandler } from '../mod.ts';
import {
  generateTOTP,
  generateTOTPSecret,
  hashPassword,
  TwoFactorPasswordProvider,
} from '../auth/mod.ts';

// Admin users table with TOTP secret column
const adminUsers2fa = pgTable('admin_users_2fa', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
  totpSecret: text('totp_secret'), // Optional - null means 2FA not enabled
});

const schemaWith2fa = { ...schema, adminUsers2fa };

async function createAdminUsers2faTable(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE admin_users_2fa (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50),
      totp_secret TEXT
    )
  `);
}

Deno.test('integration: two-factor auth tests', async (t) => {
  // Create single PGlite instance for all 2FA tests
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });

  // Create tables once
  await createBasicTables(db);
  await createAdminUsers2faTable(db);

  // Helper to reset tables between tests
  async function resetDb() {
    await db.execute(
      sql`TRUNCATE TABLE posts, users, admin_users_2fa RESTART IDENTITY CASCADE`,
    );
  }

  // Helper to create handler with 2FA auth
  function create2faHandler(extraOptions = {}) {
    return createCmsHandler({
      csrfSecret: TEST_CSRF_SECRET,
      db,
      schema: schemaWith2fa,
      basePath: '/admin',
      auth: {
        secret: AUTH_SECRET,
        provider: new TwoFactorPasswordProvider({
          db,
          usersTable: adminUsers2fa,
          identityColumn: 'email',
          passwordColumn: 'passwordHash',
          roleColumn: 'role',
          totpSecretColumn: 'totpSecret',
          issuer: 'Test CMS',
          challengeSecret: AUTH_SECRET, // Use same secret for simplicity in tests
        }),
      },
      policies: 'dangerously-open',
      ...extraOptions,
    });
  }

  // Helper to get CSRF token from a page
  async function getCsrfToken(
    handler: (req: Request) => Response | Promise<Response>,
    url: string,
  ): Promise<string> {
    const res = await handler(new Request(url));
    const html = await res.text();
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    if (!match) throw new Error('CSRF token not found');
    return match[1]!;
  }

  await t.step(
    'user without 2FA: logs in directly without TOTP prompt',
    async () => {
      await resetDb();

      // Create user WITHOUT 2FA
      const passwordHash = await hashPassword('password123');
      await db.insert(adminUsers2fa).values({
        email: 'regular@example.com',
        passwordHash,
        role: 'admin',
        totpSecret: null, // No 2FA
      });

      const handler = create2faHandler();

      // Get CSRF token
      const csrfToken = await getCsrfToken(
        handler,
        'http://localhost/admin/login',
      );

      // Submit login - should redirect directly (no 2FA)
      const formData = createFormData({
        identity: 'regular@example.com',
        password: 'password123',
        _csrf: csrfToken,
      });

      const loginRes = await handler(
        new Request('http://localhost/admin/login', {
          method: 'POST',
          body: formData,
        }),
      );

      assertEquals(loginRes.status, 302);
      assertEquals(loginRes.headers.get('Location'), '/admin');

      const setCookie = loginRes.headers.get('Set-Cookie');
      assertExists(setCookie, 'Cookie should be set');
      assertStringIncludes(setCookie, 'cms_token=');
    },
  );

  await t.step(
    'user with 2FA: password shows TOTP form, not final login',
    async () => {
      await resetDb();

      // Create user WITH 2FA
      const passwordHash = await hashPassword('secure123');
      const totpSecret = generateTOTPSecret();
      await db.insert(adminUsers2fa).values({
        email: 'secure@example.com',
        passwordHash,
        role: 'admin',
        totpSecret,
      });

      const handler = create2faHandler();

      // Get CSRF token
      const csrfToken = await getCsrfToken(
        handler,
        'http://localhost/admin/login',
      );

      // Submit password - should show TOTP form
      const formData = createFormData({
        identity: 'secure@example.com',
        password: 'secure123',
        _csrf: csrfToken,
      });

      const passwordRes = await handler(
        new Request('http://localhost/admin/login', {
          method: 'POST',
          body: formData,
        }),
      );

      assertEquals(passwordRes.status, 200);

      const html = await passwordRes.text();
      assertStringIncludes(html, 'totp_code');
      assertStringIncludes(html, 'challenge_token');
      assertStringIncludes(html, 'Verification Code');

      // Should NOT have a cookie yet
      assertEquals(passwordRes.headers.get('Set-Cookie'), null);
    },
  );

  await t.step('user with 2FA: valid TOTP completes login', async () => {
    await resetDb();

    // Create user WITH 2FA
    const passwordHash = await hashPassword('secure123');
    const totpSecret = generateTOTPSecret();
    await db.insert(adminUsers2fa).values({
      email: 'secure@example.com',
      passwordHash,
      role: 'admin',
      totpSecret,
    });

    const handler = create2faHandler();

    // Phase 1: Submit password
    const csrfToken1 = await getCsrfToken(
      handler,
      'http://localhost/admin/login',
    );

    const passwordRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          identity: 'secure@example.com',
          password: 'secure123',
          _csrf: csrfToken1,
        }),
      }),
    );

    // Extract challenge_token from TOTP form
    const totpFormHtml = await passwordRes.text();
    const challengeMatch = totpFormHtml.match(
      /name="challenge_token" value="([^"]+)"/,
    );
    assertExists(challengeMatch, 'challenge_token should be in form');
    const challengeToken = challengeMatch[1]!;

    // Extract CSRF token from TOTP form
    const csrfMatch = totpFormHtml.match(/name="_csrf" value="([^"]+)"/);
    assertExists(csrfMatch, 'CSRF token should be in TOTP form');
    const csrfToken2 = csrfMatch[1]!;

    // Phase 2: Submit valid TOTP
    const validTotp = await generateTOTP(totpSecret);

    const totpRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          totp_code: validTotp,
          challenge_token: challengeToken,
          _csrf: csrfToken2,
        }),
      }),
    );

    assertEquals(totpRes.status, 302);
    assertEquals(totpRes.headers.get('Location'), '/admin');

    const setCookie = totpRes.headers.get('Set-Cookie');
    assertExists(setCookie, 'Cookie should be set after TOTP');
    assertStringIncludes(setCookie, 'cms_token=');
  });

  await t.step('user with 2FA: invalid TOTP shows error', async () => {
    await resetDb();

    // Create user WITH 2FA
    const passwordHash = await hashPassword('secure123');
    const totpSecret = generateTOTPSecret();
    await db.insert(adminUsers2fa).values({
      email: 'secure@example.com',
      passwordHash,
      role: 'admin',
      totpSecret,
    });

    const handler = create2faHandler();

    // Phase 1: Submit password
    const csrfToken1 = await getCsrfToken(
      handler,
      'http://localhost/admin/login',
    );

    const passwordRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          identity: 'secure@example.com',
          password: 'secure123',
          _csrf: csrfToken1,
        }),
      }),
    );

    const totpFormHtml = await passwordRes.text();
    const challengeMatch = totpFormHtml.match(
      /name="challenge_token" value="([^"]+)"/,
    );
    const challengeToken = challengeMatch![1]!;
    const csrfMatch = totpFormHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken2 = csrfMatch![1]!;

    // Phase 2: Submit INVALID TOTP
    const totpRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          totp_code: '000000', // Invalid code
          challenge_token: challengeToken,
          _csrf: csrfToken2,
        }),
      }),
    );

    assertEquals(totpRes.status, 401);

    const html = await totpRes.text();
    assertStringIncludes(html, 'Invalid or expired verification code');
    // When challenge expires or TOTP fails, user is sent back to login
    assertStringIncludes(html, 'identity'); // Should show login form
  });

  await t.step(
    'user with 2FA: wrong password never shows TOTP form',
    async () => {
      await resetDb();

      const passwordHash = await hashPassword('correct-password');
      const totpSecret = generateTOTPSecret();
      await db.insert(adminUsers2fa).values({
        email: 'secure@example.com',
        passwordHash,
        role: 'admin',
        totpSecret,
      });

      const handler = create2faHandler();
      const csrfToken = await getCsrfToken(
        handler,
        'http://localhost/admin/login',
      );

      // Submit WRONG password
      const loginRes = await handler(
        new Request('http://localhost/admin/login', {
          method: 'POST',
          body: createFormData({
            identity: 'secure@example.com',
            password: 'wrong-password',
            _csrf: csrfToken,
          }),
        }),
      );

      assertEquals(loginRes.status, 401);

      const html = await loginRes.text();
      assertStringIncludes(html, 'Invalid email or password');

      // Should NOT show TOTP form
      assertEquals(html.includes('totp_code'), false);
    },
  );

  await t.step('TOTP with spaces is accepted', async () => {
    await resetDb();

    const passwordHash = await hashPassword('secure123');
    const totpSecret = generateTOTPSecret();
    await db.insert(adminUsers2fa).values({
      email: 'secure@example.com',
      passwordHash,
      role: 'admin',
      totpSecret,
    });

    const handler = create2faHandler();

    // Phase 1: Submit password
    const csrfToken1 = await getCsrfToken(
      handler,
      'http://localhost/admin/login',
    );

    const passwordRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          identity: 'secure@example.com',
          password: 'secure123',
          _csrf: csrfToken1,
        }),
      }),
    );

    const totpFormHtml = await passwordRes.text();
    const challengeMatch = totpFormHtml.match(
      /name="challenge_token" value="([^"]+)"/,
    );
    const challengeToken = challengeMatch![1]!;
    const csrfMatch = totpFormHtml.match(/name="_csrf" value="([^"]+)"/);
    const csrfToken2 = csrfMatch![1]!;

    // Generate valid code and add spaces (like users often copy-paste)
    const validTotp = await generateTOTP(totpSecret);
    const codeWithSpaces = validTotp.slice(0, 3) + ' ' + validTotp.slice(3);

    // Phase 2: Submit TOTP with spaces
    const totpRes = await handler(
      new Request('http://localhost/admin/login', {
        method: 'POST',
        body: createFormData({
          totp_code: codeWithSpaces,
          challenge_token: challengeToken,
          _csrf: csrfToken2,
        }),
      }),
    );

    assertEquals(totpRes.status, 302);
    assertEquals(totpRes.headers.get('Location'), '/admin');
  });

  // Cleanup
  await client.close();
});

// ─────────────────────────────────────────────────────────────
// Unit tests for TwoFactorPasswordProvider (without full handler)
// ─────────────────────────────────────────────────────────────

Deno.test('TwoFactorPasswordProvider: authenticate returns null for missing credentials', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    challengeSecret: AUTH_SECRET,
  });

  const result = await provider.authenticate({
    identity: '',
    password: '',
  });

  assertEquals(result, null);

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: authenticate returns null for non-existent user', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    challengeSecret: AUTH_SECRET,
  });

  const result = await provider.authenticate({
    identity: 'nonexistent@example.com',
    password: 'password',
  });

  assertEquals(result, null);

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: user without 2FA gets full auth immediately', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const passwordHash = await hashPassword('test123');
  await db.insert(adminUsers2fa).values({
    email: 'user@example.com',
    passwordHash,
    role: 'editor',
    totpSecret: null,
  });

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    roleColumn: 'role',
    challengeSecret: AUTH_SECRET,
  });

  const result = await provider.authenticate({
    identity: 'user@example.com',
    password: 'test123',
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
  if (result.status === 'authenticated') {
    assertEquals(result.user.role, 'editor');
  }

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: user with 2FA returns pending state', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const passwordHash = await hashPassword('test123');
  const totpSecret = generateTOTPSecret();
  await db.insert(adminUsers2fa).values({
    email: 'secure@example.com',
    passwordHash,
    role: 'admin',
    totpSecret,
  });

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    roleColumn: 'role',
    totpSecretColumn: 'totpSecret',
    challengeSecret: AUTH_SECRET,
  });

  const result = await provider.authenticate({
    identity: 'secure@example.com',
    password: 'test123',
  });

  assertExists(result);
  assertEquals(result.status, 'pending_2fa');
  if (result.status === 'pending_2fa') {
    assertExists(result.challenge);
  }

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: TOTP phase returns full auth', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const passwordHash = await hashPassword('test123');
  const totpSecret = generateTOTPSecret();
  const [inserted] = await db
    .insert(adminUsers2fa)
    .values({
      email: 'secure@example.com',
      passwordHash,
      role: 'admin',
      totpSecret,
    })
    .returning();

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    roleColumn: 'role',
    totpSecretColumn: 'totpSecret',
    challengeSecret: AUTH_SECRET,
  });

  // First get challenge token from phase 1
  const phase1Result = await provider.authenticate({
    identity: 'secure@example.com',
    password: 'test123',
  });
  assertExists(phase1Result);
  assertEquals(phase1Result.status, 'pending_2fa');
  const challengeToken = (phase1Result as { challenge: string }).challenge;

  // Generate valid TOTP
  const validCode = await generateTOTP(totpSecret);

  const result = await provider.authenticate({
    totpCode: validCode,
    challengeToken,
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
  if (result.status === 'authenticated') {
    assertEquals(result.user.role, 'admin');
    assertEquals(result.user.id, inserted!.id);
  }

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: invalid TOTP returns null', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const passwordHash = await hashPassword('test123');
  const totpSecret = generateTOTPSecret();
  await db.insert(adminUsers2fa).values({
    email: 'secure@example.com',
    passwordHash,
    role: 'admin',
    totpSecret,
  });

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    roleColumn: 'role',
    totpSecretColumn: 'totpSecret',
    challengeSecret: AUTH_SECRET,
  });

  // First get challenge token from phase 1
  const phase1Result = await provider.authenticate({
    identity: 'secure@example.com',
    password: 'test123',
  });
  const challengeToken = (phase1Result as { challenge: string }).challenge;

  const result = await provider.authenticate({
    totpCode: '000000', // Invalid
    challengeToken,
  });

  assertEquals(result, null);

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: renderTotpForm produces valid HTML', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    issuer: 'Test App',
    challengeSecret: AUTH_SECRET,
  });

  const html = provider.renderTotpForm({
    basePath: '/admin',
    title: 'Login',
    challengeToken: 'test-challenge-token',
    csrfToken: 'test-csrf-token',
  });

  assertStringIncludes(html, 'totp_code');
  assertStringIncludes(html, 'challenge_token');
  assertStringIncludes(html, 'test-challenge-token');
  assertStringIncludes(html, '_csrf');
  assertStringIncludes(html, 'test-csrf-token');
  assertStringIncludes(html, 'Verification Code');

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: renderTotpForm shows error when provided', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  const provider = new TwoFactorPasswordProvider({
    db,
    usersTable: adminUsers2fa,
    identityColumn: 'email',
    passwordColumn: 'passwordHash',
    challengeSecret: AUTH_SECRET,
  });

  const html = provider.renderTotpForm({
    basePath: '/admin',
    title: 'Login',
    challengeToken: 'token',
    csrfToken: 'token',
    error: 'Invalid code',
  });

  assertStringIncludes(html, 'Invalid code');
  assertStringIncludes(html, 'alert'); // Error styling

  await client.close();
});

Deno.test('TwoFactorPasswordProvider: throws error when no challengeSecret provided and env var not set', async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema: schemaWith2fa });
  await createAdminUsers2faTable(db);

  let errorThrown = false;
  try {
    // Note: CMS_2FA_SECRET env var is not set in tests
    new TwoFactorPasswordProvider({
      db,
      usersTable: adminUsers2fa,
      identityColumn: 'email',
      passwordColumn: 'passwordHash',
      // No challengeSecret provided
    });
  } catch (error) {
    errorThrown = true;
    assertStringIncludes(
      (error as Error).message,
      'challengeSecret must be at least 32 characters',
    );
    assertStringIncludes(
      (error as Error).message,
      'CMS_2FA_SECRET',
    );
  }

  assertEquals(errorThrown, true, 'Should throw when no challengeSecret');

  await client.close();
});
