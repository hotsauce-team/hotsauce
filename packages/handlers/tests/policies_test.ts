// Tests for policy types and helpers

import { assertEquals } from '@std/assert';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import {
  always,
  never,
  authenticated,
  roleIs,
  roleIn,
  ownedBy,
  ownedByOrContributor,
  anyOf,
  allOf,
  forActions,
  readOnly,
  adminOr,
} from '../policies/helpers.ts';
import type { PolicyContext } from '../policies/types.ts';

// Test schema
const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
});

// Test schema with contributors array (for ownedByOrContributor tests)
const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  contributors: text('contributors').array(),
});

// Helper to create test contexts
function createTestContext(user?: { sub: string; role?: string }): PolicyContext {
  return {
    user,
    request: new Request('http://localhost/admin/posts'),
  };
}

// ============================================================================
// Core helpers
// ============================================================================

Deno.test('always() returns undefined (no filter)', async () => {
  const policy = always();
  const ctx = createTestContext({ sub: 'user-1' });
  const result = await policy(ctx, 'list');
  assertEquals(result, undefined);
});

Deno.test('never() returns false (deny)', async () => {
  const policy = never();
  const ctx = createTestContext({ sub: 'user-1' });
  const result = await policy(ctx, 'list');
  assertEquals(result, false);
});

Deno.test('authenticated() allows logged-in users', async () => {
  const policy = authenticated();
  
  // Logged in
  const authCtx = createTestContext({ sub: 'user-1' });
  const authResult = await policy(authCtx, 'list');
  assertEquals(authResult, undefined);
  
  // Not logged in
  const anonCtx = createTestContext();
  const anonResult = await policy(anonCtx, 'list');
  assertEquals(anonResult, false);
});

// ============================================================================
// Role-based helpers
// ============================================================================

Deno.test('roleIs() checks specific role', async () => {
  const policy = roleIs('admin');
  
  // Admin user
  const adminCtx = createTestContext({ sub: 'user-1', role: 'admin' });
  const adminResult = await policy(adminCtx, 'list');
  assertEquals(adminResult, undefined);
  
  // Non-admin user
  const userCtx = createTestContext({ sub: 'user-2', role: 'editor' });
  const userResult = await policy(userCtx, 'list');
  assertEquals(userResult, false);
  
  // No role
  const noRoleCtx = createTestContext({ sub: 'user-3' });
  const noRoleResult = await policy(noRoleCtx, 'list');
  assertEquals(noRoleResult, false);
});

Deno.test('roleIn() checks multiple roles', async () => {
  const policy = roleIn(['admin', 'editor']);
  
  // Admin
  const adminCtx = createTestContext({ sub: 'user-1', role: 'admin' });
  assertEquals(await policy(adminCtx, 'list'), undefined);
  
  // Editor
  const editorCtx = createTestContext({ sub: 'user-2', role: 'editor' });
  assertEquals(await policy(editorCtx, 'list'), undefined);
  
  // Viewer (not in list)
  const viewerCtx = createTestContext({ sub: 'user-3', role: 'viewer' });
  assertEquals(await policy(viewerCtx, 'list'), false);
});

// ============================================================================
// Ownership helpers
// ============================================================================

Deno.test('ownedBy() returns SQL condition', async () => {
  const policy = ownedBy(posts, 'authorId');
  const ctx = createTestContext({ sub: 'user-123' });
  
  const result = await policy(ctx, 'list');
  
  // Should return a SQL condition (not undefined or false)
  assertEquals(typeof result, 'object');
  assertEquals(result !== undefined, true);
  assertEquals(result !== false, true);
});

Deno.test('ownedBy() denies unauthenticated users', async () => {
  const policy = ownedBy(posts, 'authorId');
  const ctx = createTestContext(); // No user
  
  const result = await policy(ctx, 'list');
  assertEquals(result, false);
});

Deno.test('ownedByOrContributor() returns SQL condition for owner', async () => {
  const policy = ownedByOrContributor(projects, 'ownerId', 'contributors');
  const ctx = createTestContext({ sub: 'user-123' });
  
  const result = await policy(ctx, 'list');
  
  // Should return a SQL condition (OR of owner check and array contains)
  assertEquals(typeof result, 'object');
  assertEquals(result !== undefined, true);
  assertEquals(result !== false, true);
});

Deno.test('ownedByOrContributor() denies unauthenticated users', async () => {
  const policy = ownedByOrContributor(projects, 'ownerId', 'contributors');
  const ctx = createTestContext(); // No user
  
  const result = await policy(ctx, 'list');
  assertEquals(result, false);
});

// ============================================================================
// Combining helpers
// ============================================================================

Deno.test('anyOf() grants access if any policy allows', async () => {
  // Combine: admin OR owner
  const policy = anyOf([
    roleIs('admin'),
    ownedBy(posts, 'authorId'),
  ]);
  
  // Admin gets full access (undefined = no filter)
  const adminCtx = createTestContext({ sub: 'admin-1', role: 'admin' });
  const adminResult = await policy(adminCtx, 'list');
  assertEquals(adminResult, undefined);
  
  // Non-admin gets ownership filter (SQL condition)
  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });
  const userResult = await policy(userCtx, 'list');
  assertEquals(typeof userResult, 'object'); // SQL condition
  assertEquals(userResult !== undefined, true);
  assertEquals(userResult !== false, true);
});

Deno.test('anyOf() denies if all policies deny', async () => {
  const policy = anyOf([
    roleIs('admin'),
    roleIs('superadmin'),
  ]);
  
  const ctx = createTestContext({ sub: 'user-1', role: 'viewer' });
  const result = await policy(ctx, 'list');
  assertEquals(result, false);
});

Deno.test('allOf() requires all policies to pass', async () => {
  const policy = allOf([
    authenticated(),
    roleIs('admin'),
  ]);
  
  // Both pass
  const adminCtx = createTestContext({ sub: 'admin-1', role: 'admin' });
  const adminResult = await policy(adminCtx, 'list');
  assertEquals(adminResult, undefined);
  
  // One fails (not admin)
  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });
  const userResult = await policy(userCtx, 'list');
  assertEquals(userResult, false);
  
  // One fails (not authenticated)
  const anonCtx = createTestContext();
  const anonResult = await policy(anonCtx, 'list');
  assertEquals(anonResult, false);
});

// ============================================================================
// Action-specific helpers
// ============================================================================

Deno.test('forActions() applies different policies per action', async () => {
  const policy = forActions({
    list: always(),
    read: always(),
    create: authenticated(),
    update: roleIs('admin'),
    delete: never(),
  });
  
  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });
  
  // List/read allowed
  assertEquals(await policy(userCtx, 'list'), undefined);
  assertEquals(await policy(userCtx, 'read'), undefined);
  
  // Create allowed (authenticated)
  assertEquals(await policy(userCtx, 'create'), undefined);
  
  // Update denied (not admin)
  assertEquals(await policy(userCtx, 'update'), false);
  
  // Delete denied (never)
  assertEquals(await policy(userCtx, 'delete'), false);
});

Deno.test('forActions() uses fallback for undefined actions', async () => {
  const policy = forActions({
    list: always(),
    '*': never(), // Default deny
  });
  
  const ctx = createTestContext({ sub: 'user-1' });
  
  // Defined action
  assertEquals(await policy(ctx, 'list'), undefined);
  
  // Undefined action uses fallback
  assertEquals(await policy(ctx, 'create'), false);
  assertEquals(await policy(ctx, 'update'), false);
});

Deno.test('readOnly() allows only list and read', async () => {
  const policy = readOnly();
  const ctx = createTestContext({ sub: 'user-1' });
  
  // Read operations allowed
  assertEquals(await policy(ctx, 'list'), undefined);
  assertEquals(await policy(ctx, 'read'), undefined);
  
  // Write operations denied
  assertEquals(await policy(ctx, 'create'), false);
  assertEquals(await policy(ctx, 'update'), false);
  assertEquals(await policy(ctx, 'delete'), false);
});

Deno.test('adminOr() allows admins to bypass', async () => {
  const policy = adminOr(ownedBy(posts, 'authorId'));
  
  // Admin bypasses
  const adminCtx = createTestContext({ sub: 'admin-1', role: 'admin' });
  const adminResult = await policy(adminCtx, 'update');
  assertEquals(adminResult, undefined);
  
  // Non-admin gets ownership filter
  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });
  const userResult = await policy(userCtx, 'update');
  assertEquals(typeof userResult, 'object'); // SQL condition
});
