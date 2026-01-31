// PasswordProvider integration tests
// Tests the full authentication flow with a real database

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
// Database setup helpers
// ─────────────────────────────────────────────────────────────

async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema: { users, basicUsers } });

  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50),
      totp_secret TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE basic_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50)
    )
  `);

  return { client, db };
}

async function createTestUser(
  db: ReturnType<typeof drizzle>,
  email: string,
  password: string,
  options: { role?: string; totpSecret?: string; table?: 'users' | 'basic' } =
    {},
) {
  const passwordHash = await hashPassword(password);

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
  const { db } = await createTestDb();

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
  const { db } = await createTestDb();

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
  const { db } = await createTestDb();

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
  const { db } = await createTestDb();

  const providerWith2FA = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });
  assertEquals(providerWith2FA.twoFactorEnabled, true);

  // Table without totp column
  const basicUsers = pgTable('basic_users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
  });

  const providerWithout2FA = new PasswordProvider({
    db,
    usersTable: basicUsers,
    totpSecretColumn: 'totpSecret', // doesn't exist on table
  });
  assertEquals(providerWithout2FA.twoFactorEnabled, false);
});

// ─────────────────────────────────────────────────────────────
// Authentication tests (Phase 1 - password)
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: authenticate with valid credentials', async () => {
  const { db } = await createTestDb();
  await createTestUser(db, 'test@example.com', 'password123', {
    role: 'admin',
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  const result = await provider.authenticate({
    identity: 'test@example.com',
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
  if (result.status === 'authenticated') {
    assertEquals(result.user.identity, 'test@example.com');
    assertEquals(result.user.role, 'admin');
  }
});

Deno.test('PasswordProvider: authenticate fails with wrong password', async () => {
  const { db } = await createTestDb();
  await createTestUser(db, 'test@example.com', 'password123', {
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  const result = await provider.authenticate({
    identity: 'test@example.com',
    password: 'wrongpassword',
  });

  assertEquals(result, null);
});

Deno.test('PasswordProvider: authenticate fails with unknown user', async () => {
  const { db } = await createTestDb();

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  const result = await provider.authenticate({
    identity: 'unknown@example.com',
    password: 'anypassword',
  });

  assertEquals(result, null);
});

Deno.test('PasswordProvider: authenticate fails with empty credentials', async () => {
  const { db } = await createTestDb();

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

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
// 2FA Authentication tests (Phase 1 returns pending)
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: returns pending_2fa when user has TOTP', async () => {
  const { db } = await createTestDb();
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, 'secure@example.com', 'password123', {
    totpSecret,
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.authenticate({
    identity: 'secure@example.com',
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'pending_2fa');
  if (result.status === 'pending_2fa') {
    assertExists(result.challenge);
    assertEquals(typeof result.challenge, 'string');
  }
});

Deno.test('PasswordProvider: skips 2FA when user has no TOTP secret', async () => {
  const { db } = await createTestDb();
  // User without TOTP secret
  await createTestUser(db, 'basic@example.com', 'password123');

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  const result = await provider.authenticate({
    identity: 'basic@example.com',
    password: 'password123',
  });

  assertExists(result);
  assertEquals(result.status, 'authenticated');
  if (result.status === 'authenticated') {
    assertEquals(result.user.identity, 'basic@example.com');
  }
});

// ─────────────────────────────────────────────────────────────
// 2FA Authentication tests (Phase 2 - TOTP verification)
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: full 2FA flow with valid TOTP', async () => {
  const { db } = await createTestDb();
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, '2fa@example.com', 'password123', {
    totpSecret,
    role: 'admin',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Phase 1: password auth
  const phase1 = await provider.authenticate({
    identity: '2fa@example.com',
    password: 'password123',
  });

  assertExists(phase1);
  assertEquals(phase1.status, 'pending_2fa');
  if (phase1.status !== 'pending_2fa') throw new Error('Expected pending_2fa');

  // Phase 2: TOTP verification
  const validCode = await generateTOTP(totpSecret);
  const phase2 = await provider.authenticate({
    totpCode: validCode,
    challengeToken: phase1.challenge,
  });

  assertExists(phase2);
  assertEquals(phase2.status, 'authenticated');
  if (phase2.status === 'authenticated') {
    assertEquals(phase2.user.identity, '2fa@example.com');
    assertEquals(phase2.user.role, 'admin');
  }
});

Deno.test('PasswordProvider: 2FA fails with invalid TOTP code', async () => {
  const { db } = await createTestDb();
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, '2fa-fail@example.com', 'password123', {
    totpSecret,
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Phase 1
  const phase1 = await provider.authenticate({
    identity: '2fa-fail@example.com',
    password: 'password123',
  });

  assertExists(phase1);
  if (phase1.status !== 'pending_2fa') throw new Error('Expected pending_2fa');

  // Phase 2 with wrong code
  const phase2 = await provider.authenticate({
    totpCode: '000000', // wrong code
    challengeToken: phase1.challenge,
  });

  assertEquals(phase2, null);
});

Deno.test('PasswordProvider: 2FA fails with invalid challenge token', async () => {
  const { db } = await createTestDb();
  const totpSecret = generateTOTPSecret();
  await createTestUser(db, '2fa-token@example.com', 'password123', {
    totpSecret,
  });

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Try to use a tampered challenge token
  const validCode = await generateTOTP(totpSecret);
  const result = await provider.authenticate({
    totpCode: validCode,
    challengeToken: 'invalid-challenge-token',
  });

  assertEquals(result, null);
});

// ─────────────────────────────────────────────────────────────
// Account management tests
// ─────────────────────────────────────────────────────────────

Deno.test('PasswordProvider: getUser returns user info', async () => {
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'getuser@example.com', 'pass', {
    role: 'editor',
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  const user = await provider.getUser(userId);

  assertExists(user);
  assertEquals(user.id, userId);
  assertEquals(user.identity, 'getuser@example.com');
  assertEquals(user.role, 'editor');
});

Deno.test('PasswordProvider: getUser returns null for unknown user', async () => {
  const { db } = await createTestDb();

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  const user = await provider.getUser(99999);

  assertEquals(user, null);
});

Deno.test('PasswordProvider: setPassword updates hash', async () => {
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'update@example.com', 'oldpassword', {
    table: 'basic',
  });

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

  // Update password
  const newHash = await hashPassword('newpassword');
  await provider.setPassword(userId, newHash);

  // Verify old password no longer works
  const oldResult = await provider.authenticate({
    identity: 'update@example.com',
    password: 'oldpassword',
  });
  assertEquals(oldResult, null);

  // Verify new password works
  const newResult = await provider.authenticate({
    identity: 'update@example.com',
    password: 'newpassword',
  });
  assertExists(newResult);
  assertEquals(newResult.status, 'authenticated');
});

Deno.test('PasswordProvider: setTotpSecret enables 2FA', async () => {
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'enable2fa@example.com', 'password');

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Initially no 2FA
  assertEquals(await provider.userHas2FA(userId), false);

  // Enable 2FA
  const secret = generateTOTPSecret();
  await provider.setTotpSecret(userId, secret);

  // Now has 2FA
  assertEquals(await provider.userHas2FA(userId), true);

  // Auth should now require 2FA
  const result = await provider.authenticate({
    identity: 'enable2fa@example.com',
    password: 'password',
  });
  assertExists(result);
  assertEquals(result.status, 'pending_2fa');
});

Deno.test('PasswordProvider: setTotpSecret with null disables 2FA', async () => {
  const { db } = await createTestDb();
  const secret = generateTOTPSecret();
  const userId = await createTestUser(
    db,
    'disable2fa@example.com',
    'password',
    {
      totpSecret: secret,
    },
  );

  const provider = new PasswordProvider({
    db,
    usersTable: users,
    totpSecretColumn: 'totpSecret',
    challengeSecret: TEST_SECRET,
  });

  // Initially has 2FA
  assertEquals(await provider.userHas2FA(userId), true);

  // Disable 2FA
  await provider.setTotpSecret(userId, null);

  // No longer has 2FA
  assertEquals(await provider.userHas2FA(userId), false);

  // Auth should skip 2FA
  const result = await provider.authenticate({
    identity: 'disable2fa@example.com',
    password: 'password',
  });
  assertExists(result);
  assertEquals(result.status, 'authenticated');
});

Deno.test('PasswordProvider: setTotpSecret throws if 2FA not enabled', async () => {
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'no2fa@example.com', 'password', {
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
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'check2fa@example.com', 'password', {
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
  const { db } = await createTestDb();
  const secret = generateTOTPSecret();
  const userId = await createTestUser(db, 'getsecret@example.com', 'password', {
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
  const { db } = await createTestDb();
  const userId = await createTestUser(db, 'nosecret@example.com', 'password');

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
  const { db } = await createTestDb();

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

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
  const { db } = await createTestDb();

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
  const { db } = await createTestDb();

  const provider = new PasswordProvider({
    db,
    usersTable: basicUsers,
  });

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
