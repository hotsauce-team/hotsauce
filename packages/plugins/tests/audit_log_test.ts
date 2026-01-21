// Integration tests for audit log plugin
// Tests the audit log plugin with a real database

import { assertEquals, assertExists } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { pgTable, serial, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { createCmsHandler, generateCsrfToken } from '@drizzle-cms/handlers';
import { createAuditLogPlugin } from '../audit-log.ts';

// Test CSRF secret
const TEST_CSRF_SECRET = 'test-csrf-secret-for-audit-plugin-tests-min-32-chars';

// ============================================================================
// Test Schema
// ============================================================================

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull(),
  action: text('action').notNull(),
  recordId: text('record_id').notNull(),
  userId: text('user_id'),
  changes: jsonb('changes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

const schema = { users, auditLogs };

// ============================================================================
// Helper Functions
// ============================================================================

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value);
  }
  return formData;
}

// ============================================================================
// Audit Log Plugin Tests
// ============================================================================

Deno.test('audit log plugin: logs create actions', async () => {
  // Create database
  const client = new PGlite();
  const db = drizzle(client, { schema });
  
  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  await db.execute(sql`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      changes JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Create handler with audit log plugin
  const handler = createCmsHandler({
    db,
    schema,
    csrfSecret: TEST_CSRF_SECRET,
    basePath: '/admin',
    plugins: [
      createAuditLogPlugin({
        db,
        auditTable: auditLogs,
      }),
    ],
  });
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  
  // Create a user via CMS
  const formData = createFormData({
    _csrf: csrfToken,
    email: 'test@example.com',
    name: 'Test User',
  });
  
  const createRequest = new Request('http://localhost/admin/users/new', {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(createRequest);
  
  // Should redirect on success (303 See Other for POST redirects)
  assertEquals(response.status, 303);
  
  // Check that audit log was created
  const logs = await db.select().from(auditLogs);
  assertEquals(logs.length, 1);
  assertEquals(logs[0]?.tableName, 'users');
  assertEquals(logs[0]?.action, 'create');
  assertExists(logs[0]?.recordId);
  
  // Close database
  await client.close();
});

Deno.test('audit log plugin: logs update actions', async () => {
  // Create database
  const client = new PGlite();
  const db = drizzle(client, { schema });
  
  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  await db.execute(sql`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      changes JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Insert a user directly
  const [user] = await db.insert(users).values({
    email: 'test@example.com',
    name: 'Test User',
  }).returning();
  
  // Create handler with audit log plugin
  const handler = createCmsHandler({
    db,
    schema,
    csrfSecret: TEST_CSRF_SECRET,
    basePath: '/admin',
    plugins: [
      createAuditLogPlugin({
        db,
        auditTable: auditLogs,
      }),
    ],
  });
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  
  // Update the user via CMS
  const formData = createFormData({
    _csrf: csrfToken,
    email: 'updated@example.com',
    name: 'Updated User',
  });
  
  const updateRequest = new Request(`http://localhost/admin/users/${user!.id}`, {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(updateRequest);
  
  // Should redirect on success (303 See Other for POST redirects)
  assertEquals(response.status, 303);
  
  // Check that audit log was created
  const logs = await db.select().from(auditLogs);
  assertEquals(logs.length, 1);
  assertEquals(logs[0]?.tableName, 'users');
  assertEquals(logs[0]?.action, 'update');
  assertEquals(logs[0]?.recordId, String(user!.id));
  
  // Close database
  await client.close();
});

Deno.test('audit log plugin: logs delete actions', async () => {
  // Create database
  const client = new PGlite();
  const db = drizzle(client, { schema });
  
  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  await db.execute(sql`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      changes JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Insert a user directly
  const [user] = await db.insert(users).values({
    email: 'test@example.com',
    name: 'Test User',
  }).returning();
  
  // Create handler with audit log plugin
  const handler = createCmsHandler({
    db,
    schema,
    csrfSecret: TEST_CSRF_SECRET,
    basePath: '/admin',
    plugins: [
      createAuditLogPlugin({
        db,
        auditTable: auditLogs,
      }),
    ],
  });
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  
  // Delete the user via CMS
  const formData = createFormData({
    _csrf: csrfToken,
  });
  
  const deleteRequest = new Request(`http://localhost/admin/users/${user!.id}/delete`, {
    method: 'POST',
    body: formData,
  });
  
  const response = await handler(deleteRequest);
  
  // Should redirect on success (303 See Other for POST redirects)
  assertEquals(response.status, 303);
  
  // Check that audit log was created
  const logs = await db.select().from(auditLogs);
  assertEquals(logs.length, 1);
  assertEquals(logs[0]?.tableName, 'users');
  assertEquals(logs[0]?.action, 'delete');
  assertEquals(logs[0]?.recordId, String(user!.id));
  
  // Close database
  await client.close();
});

Deno.test('audit log plugin: logs full record data when enabled', async () => {
  // Create database
  const client = new PGlite();
  const db = drizzle(client, { schema });
  
  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  await db.execute(sql`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      changes JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Create handler with audit log plugin (logFullRecord enabled)
  const handler = createCmsHandler({
    db,
    schema,
    csrfSecret: TEST_CSRF_SECRET,
    basePath: '/admin',
    plugins: [
      createAuditLogPlugin({
        db,
        auditTable: auditLogs,
        logFullRecord: true,
      }),
    ],
  });
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  
  // Create a user via CMS
  const formData = createFormData({
    _csrf: csrfToken,
    email: 'test@example.com',
    name: 'Test User',
  });
  
  const createRequest = new Request('http://localhost/admin/users/new', {
    method: 'POST',
    body: formData,
  });
  
  await handler(createRequest);
  
  // Check that audit log includes full record data
  const logs = await db.select().from(auditLogs);
  assertEquals(logs.length, 1);
  assertExists(logs[0]?.changes);
  // changes should be a JSON object with the record data
  assertEquals(typeof logs[0]?.changes, 'object');
  
  // Close database
  await client.close();
});

Deno.test('audit log plugin: respects table filters', async () => {
  // Create database
  const client = new PGlite();
  const db = drizzle(client, { schema });
  
  // Create tables
  await db.execute(sql`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  await db.execute(sql`
    CREATE TABLE audit_logs (
      id SERIAL PRIMARY KEY,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      user_id TEXT,
      changes JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  
  // Create handler with audit log plugin (exclude users table)
  const handler = createCmsHandler({
    db,
    schema,
    csrfSecret: TEST_CSRF_SECRET,
    basePath: '/admin',
    plugins: [
      createAuditLogPlugin({
        db,
        auditTable: auditLogs,
        excludeTables: ['users'],
      }),
    ],
  });
  
  // Generate CSRF token
  const csrfToken = await generateCsrfToken(TEST_CSRF_SECRET);
  
  // Create a user via CMS
  const formData = createFormData({
    _csrf: csrfToken,
    email: 'test@example.com',
    name: 'Test User',
  });
  
  const createRequest = new Request('http://localhost/admin/users/new', {
    method: 'POST',
    body: formData,
  });
  
  await handler(createRequest);
  
  // Check that NO audit log was created (users excluded)
  const logs = await db.select().from(auditLogs);
  assertEquals(logs.length, 0);
  
  // Close database
  await client.close();
});
