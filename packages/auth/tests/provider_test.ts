// PasswordProvider integration tests
// Tests the full authentication flow with a real database
//
// OPTIMIZATION: Uses a shared PGlite instance and pre-computed password hashes
// to avoid expensive setup (~300ms per PGlite + ~130ms per hash)
//
// Each test uses unique email addresses to enable parallel execution.

import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

import { PasswordProvider } from '../provider.ts';
import { hashPassword } from '../password.ts';
import { generateTOTP, generateTOTPSecret } from '../totp.ts';

// ─────────────────────────────────────────────────────────────
// Test schema
// ─────────────────────────────────────────────────────────────

// Full users table with 2FA support
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
  totpSecret: text('totp_secret'),
});

// Basic users table without 2FA (for testing non-2FA scenarios)
const basicUsers = pgTable('basic_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }),
});

const TEST_SECRET = 'test-challenge-secret-at-least-32-characters';

// ─────────────────────────────────────────────────────────────
// Shared database instance (created once, reused across tests)
// ─────────────────────────────────────────────────────────────

let sharedClient: PGlite | null = null;
let sharedDb: ReturnType<typeof drizzle> | null = null;

// Pre-computed password hashes (avoids ~130ms PBKDF2 per test)
let precomputedHashes: Record<string, string> = {};

// Counter for unique emails (avoids conflicts in parallel tests)
let emailCounter = 0;
function uniqueEmail(prefix: string): string {
  return `${prefix}-${++emailCounter}-${Date.now()}@test.local`;
}

// Initialization promise to prevent race conditions in parallel tests
let initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

function getSharedDb(): Promise<ReturnType<typeof drizzle>> {
  if (initPromise) {
    return initPromise;
  }

  if (sharedDb) {
    return Promise.resolve(sharedDb);
  }

  // Create init promise to prevent duplicate initialization
  initPromise = (async () => {
    sharedClient = new PGlite();
    sharedDb = drizzle(sharedClient, { schema: { users, basicUsers } });

    await sharedDb.execute(sql`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(50),
        totp_secret TEXT
      )
    `);

    await sharedDb.execute(sql`
      CREATE TABLE basic_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role VARCHAR(50)
      )
    `);

    // Pre-compute common password hashes once
    precomputedHashes = {
      password: await hashPassword('password'),
      password123: await hashPassword('password123'),
      oldpassword: await hashPassword('oldpassword'),
      newpassword: await hashPassword('newpassword'),
    };

    return sharedDb;
  })();

  return initPromise;
}

async function createTestUser(
  db: ReturnType<typeof drizzle>,
  email: string,
  password: string,
  options: { role?: string; totpSecret?: string; table?: 'users' | 'basic' } =
    {},
) {
  // Use pre-computed hash if available, otherwise compute (for edge cases)
  const passwordHash = precomputedHashes[password] ??
    (await hashPassword(password));

  if (options.table === 'basic') {
    const result = await db
      .insert(basicUsers)
      .values({
        email,
        passwordHash,
        role: options.role ?? null,
      })
      .returning({ id: basicUsers.id });
    return result[0]!.id;
  } else {
    const result = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: options.role ?? null,
        totpSecret: options.totpSecret ?? null,
      })
      .returning({ id: users.id });
    return result[0]!.id;
  }
}

// ─────────────────────────────────────────────────────────────
// Constructor tests
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: constructor validates required columns', async () => {
  const db = await getSharedDb();

  // Missing identity column
  const badTable = pgTable('bad_users', {
    id: serial('id').primaryKey(),
    passwordHash: text('password_hash').notNull(),
  });

  try {
    new PasswordProvider({
      db,
      usersTable: badTable,
      identityColumn: 'email', // doesn't exist
    });
    throw new Error('Should have thrown');
  } catch (e) {
    assertEquals((e as Error).message.includes('email'), true);
  }
});

Deno.test('PasswordProvider: constructor validates password column', async () => {
  const db = await getSharedDb();

  const badTable = pgTable('bad_users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
  });

  try {
    new PasswordProvider({
      db,
      usersTable: badTable,
      passwordColumn: 'passwordHash', // doesn't exist
    });
    throw new Error('Should have thrown');
  } catch (e) {
    assertEquals((e as Error).message.includes('passwordHash'), true);
  }
});

Deno.test('PasswordProvider: constructor requires 32-char secret when 2FA enabled', async () => {
  const db = await getSharedDb();

  try {
    new PasswordProvider({
      db,
      usersTable: users,
      totpSecretColumn: 'totpSecret',
      challengeSecret: 'short', // too short
    });
    throw new Error('Should have thrown');
  } catch (e) {
    assertEquals((e as Error).message.includes('32 characters'), true);
  }
});

Deno.test('PasswordProvider: twoFactorEnabled reflects column presence', async () => {
  const db = await getSharedDb();

  const providerWith2FA = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });
  assertEquals(providerWith2FA.twoFactorEnabled, true);

  // Table without totp column
  const noTotpTable = pgTable('no_totp', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
  });

  const providerWithout2FA = new PasswordProvider({
    db,
    usersTable: noTotpTable,
    totpSecretColumn: 'totpSecret', // doesn't exist on table
  });
  assertEquals(providerWithout2FA.twoFactorEnabled, false);
});

// ─────────────────────────────────────────────────────────────
// Authentication tests (Phase 1 - password)
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: authenticate with valid credentials', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('valid');
  await createTestUser(db, email, 'password123', {
    role: 'admin',
    table: 'basic',
  });

  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const result = await provider.authenticate({
    identity: email,
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
  if (result.status === 'authenticated') {
    assertEquals(result.user.identity, email);
    assertEquals(result.user.role, 'admin');
  }
});

Deno.test('PasswordProvider: authenticate fails with wrong password', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('wrongpw');
  await createTestUser(db, email, 'password123', { table: 'basic' });

  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const result = await provider.authenticate({
    identity: email,
    password: 'wrongpassword',
  });

  assertEquals(result, null);
});

Deno.test('PasswordProvider: authenticate fails with unknown user', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const result = await provider.authenticate({
    identity: uniqueEmail('unknown'),
    password: 'password123',
  });

  assertEquals(result, null);
});

Deno.test('PasswordProvider: authenticate fails with empty credentials', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  assertEquals(
    await provider.authenticate({ identity: '', password: '' }),
    null,
  );
  assertEquals(
    await provider.authenticate({ identity: 'a', password: '' }),
    null,
  );
  assertEquals(
    await provider.authenticate({ identity: '', password: 'b' }),
    null,
  );
});

// ─────────────────────────────────────────────────────────────
// 2FA tests (Phase 2 - TOTP)
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: returns pending_2fa when user has TOTP', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('pending2fa');
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, email, 'password123', { totpSecret });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.authenticate({
    identity: email,
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'pending_2fa');
  if (result.status === 'pending_2fa') {
    assertExists(result.challenge);
  }
});

Deno.test('PasswordProvider: skips 2FA when user has no TOTP secret', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('no2fa');
  await createTestUser(db, email, 'password123');

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.authenticate({
    identity: email,
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
});

Deno.test('PasswordProvider: full 2FA flow with valid TOTP', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('2faflow');
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, email, 'password123', { totpSecret });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Phase 1: Password
  const phase1 = await provider.authenticate({
    identity: email,
    password: 'password123',
  });

  assertExists(phase1);
  assertEquals(phase1.status, 'pending_2fa');
  if (phase1.status !== 'pending_2fa') throw new Error('Expected pending_2fa');

  // Phase 2: TOTP - generate code and verify
  const totpCode = await generateTOTP(totpSecret);
  const phase2 = await provider.authenticate({
    totpCode,
    challengeToken: phase1.challenge,
  });

  assertExists(phase2);
  assertEquals(phase2.status, 'authenticated');
  if (phase2.status === 'authenticated') {
    assertEquals(phase2.user.identity, email);
  }
});

Deno.test('PasswordProvider: 2FA fails with invalid TOTP code', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('2fafail');
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, email, 'password123', { totpSecret });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Phase 1
  const phase1 = await provider.authenticate({
    identity: email,
    password: 'password123',
  });

  assertExists(phase1);
  if (phase1.status !== 'pending_2fa') throw new Error('Expected pending_2fa');

  // Phase 2 with wrong code
  const phase2 = await provider.authenticate({
    totpCode: '000000',
    challengeToken: phase1.challenge,
  });

  assertEquals(phase2, null);
});

Deno.test('PasswordProvider: 2FA fails with invalid challenge token', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('2fatoken');
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, email, 'password123', { totpSecret });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.authenticate({
    totpCode: await generateTOTP(totpSecret),
    challengeToken: 'invalid-token',
  });

  assertEquals(result, null);
});

// ─────────────────────────────────────────────────────────────
// Account management tests
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: getUser returns user info', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('getuser');
  const userId = await createTestUser(db, email, 'password', {
    role: 'editor',
    table: 'basic',
  });

  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const user = await provider.getUser(userId);
  assertExists(user);
  assertEquals(user.identity, email);
  assertEquals(user.role, 'editor');
});

Deno.test('PasswordProvider: getUser returns null for unknown user', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const user = await provider.getUser(99999);
  assertEquals(user, null);
});

Deno.test('PasswordProvider: setPassword updates hash', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('setpw');
  const userId = await createTestUser(db, email, 'oldpassword', {
    table: 'basic',
  });

  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  // Update password (setPassword takes a hash, not plaintext)
  const newHash = await hashPassword('newpassword');
  await provider.setPassword(userId, newHash);

  // Verify old password no longer works
  const oldResult = await provider.authenticate({
    identity: email,
    password: 'oldpassword',
  });
  assertEquals(oldResult, null);

  // Verify new password works
  const newResult = await provider.authenticate({
    identity: email,
    password: 'newpassword',
  });
  assertExists(newResult);
  assertEquals(newResult.status, 'authenticated');
});

// ─────────────────────────────────────────────────────────────
// TOTP management tests
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: setTotpSecret enables 2FA', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('setup2fa');
  const userId = await createTestUser(db, email, 'password');

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const secret = generateTOTPSecret();
  await provider.setTotpSecret(userId, secret);

  // Now authentication should require 2FA
  const result = await provider.authenticate({
    identity: email,
    password: 'password',
  });
  assertExists(result);
  assertEquals(result.status, 'pending_2fa');
});

Deno.test('PasswordProvider: setTotpSecret with null disables 2FA', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('disable2fa');
  const secret = generateTOTPSecret();
  const userId = await createTestUser(db, email, 'password', {
    totpSecret: secret,
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Disable 2FA
  await provider.setTotpSecret(userId, null);

  // Now authentication should succeed without 2FA
  const result = await provider.authenticate({
    identity: email,
    password: 'password',
  });
  assertExists(result);
  assertEquals(result.status, 'authenticated');
});

Deno.test('PasswordProvider: setTotpSecret throws if 2FA not enabled', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('no2fa');
  const userId = await createTestUser(db, email, 'password', {
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
    // No totpSecretColumn configured (column doesn't exist on basicUsers)
  });

  await assertRejects(
    async () => await provider.setTotpSecret(userId, 'secret'),
    Error,
    '2FA is not enabled',
  );
});

Deno.test('PasswordProvider: userHas2FA returns false when 2FA disabled', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('check2fa');
  const userId = await createTestUser(db, email, 'password', {
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
    // No 2FA configured (column doesn't exist on basicUsers)
  });

  // Should return false since provider doesn't have 2FA
  assertEquals(await provider.userHas2FA(userId), false);
});

Deno.test('PasswordProvider: getTotpSecret returns secret when present', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('getsecret');
  const secret = generateTOTPSecret();
  const userId = await createTestUser(db, email, 'password', {
    totpSecret: secret,
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.getTotpSecret(userId);
  assertEquals(result, secret);
});

Deno.test('PasswordProvider: getTotpSecret returns null when no secret', async () => {
  const db = await getSharedDb();
  const email = uniqueEmail('nosecret');
  const userId = await createTestUser(db, email, 'password');

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.getTotpSecret(userId);
  assertEquals(result, null);
});

// ─────────────────────────────────────────────────────────────
// parseCredentials tests
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: parseCredentials extracts password creds', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  const formData = new FormData();
  formData.append('identity', 'user@example.com');
  formData.append('password', 'secret');

  const request = new Request('http://localhost/login', {
    method: 'POST',
    body: formData,
  });

  const creds = await provider.parseCredentials(request);

  assertExists(creds);
  assertEquals(creds.identity, 'user@example.com');
  assertEquals(creds.password, 'secret');
});

Deno.test('PasswordProvider: parseCredentials extracts TOTP creds', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const formData = new FormData();
  formData.append('totp_code', '123 456'); // with space
  formData.append('challenge_token', 'token-abc');

  const request = new Request('http://localhost/login', {
    method: 'POST',
    body: formData,
  });

  const creds = await provider.parseCredentials(request);

  assertExists(creds);
  assertEquals(creds.totpCode, '123456'); // space stripped
  assertEquals(creds.challengeToken, 'token-abc');
});

Deno.test('PasswordProvider: parseCredentials returns null for missing fields', async () => {
  const db = await getSharedDb();
  const provider = new PasswordProvider({ db, usersTable: basicUsers });

  // Missing password
  const formData = new FormData();
  formData.append('identity', 'user@example.com');

  const request = new Request('http://localhost/login', {
    method: 'POST',
    body: formData,
  });

  const creds = await provider.parseCredentials(request);
  assertEquals(creds, null);
});
