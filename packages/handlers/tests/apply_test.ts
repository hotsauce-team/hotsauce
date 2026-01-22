// Tests for policy application logic

import { assertEquals, assertExists } from '@std/assert';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import { applyPolicy, createPolicyContext } from '../policies/apply.ts';
import {
  adminOr,
  always,
  authenticated,
  never,
  ownedBy,
} from '../policies/helpers.ts';
import type { PolicyContext } from '../policies/types.ts';

// Test schema
const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
});

// Helper to create test contexts
function createTestContext(
  user?: { sub: string; role?: string },
): PolicyContext {
  return {
    user,
    request: new Request('http://localhost/admin/posts'),
  };
}

// ============================================================================
// applyPolicy tests
// ============================================================================

Deno.test('applyPolicy returns allowed when no policy defined', async () => {
  const ctx = createTestContext({ sub: 'user-1' });

  const result = await applyPolicy(undefined, ctx, 'list');
  assertEquals(result.allowed, true);
  assertEquals(result.condition, undefined);
});

Deno.test('applyPolicy applies always() policy', async () => {
  const ctx = createTestContext({ sub: 'user-1' });

  const result = await applyPolicy(always(), ctx, 'list');
  assertEquals(result.allowed, true);
  assertEquals(result.condition, undefined);
});

Deno.test('applyPolicy returns denied for never() policy', async () => {
  const ctx = createTestContext({ sub: 'user-1' });

  const result = await applyPolicy(never(), ctx, 'list');
  assertEquals(result.allowed, false);
});

Deno.test('applyPolicy returns condition from ownedBy()', async () => {
  const ctx = createTestContext({ sub: 'user-123' });

  const result = await applyPolicy(ownedBy(posts, 'authorId'), ctx, 'list');

  assertEquals(result.allowed, true);
  assertExists(result.condition); // SQL condition
});

Deno.test('applyPolicy works with async policies', async () => {
  const asyncPolicy = async (_ctx: PolicyContext, _action: string) => {
    // Simulate async operation (e.g., checking external service)
    await new Promise((resolve) => setTimeout(resolve, 1));
    return undefined;
  };

  const ctx = createTestContext({ sub: 'user-1' });

  const result = await applyPolicy(asyncPolicy, ctx, 'list');
  assertEquals(result.allowed, true);
});

// ============================================================================
// createPolicyContext tests
// ============================================================================

Deno.test('createPolicyContext creates context with user', () => {
  const request = new Request('http://localhost/admin/posts');
  const user = { id: 'user-123', role: 'admin' };

  const ctx = createPolicyContext(request, user);

  assertEquals(ctx.request, request);
  assertEquals(ctx.user?.sub, 'user-123');
  assertEquals(ctx.user?.role, 'admin');
});

Deno.test('createPolicyContext creates context without user', () => {
  const request = new Request('http://localhost/admin/posts');

  const ctx = createPolicyContext(request, undefined);

  assertEquals(ctx.request, request);
  assertEquals(ctx.user, undefined);
});

// ============================================================================
// Integration scenarios
// ============================================================================

Deno.test('admin bypasses ownership policy via adminOr', async () => {
  const policy = adminOr(ownedBy(posts, 'authorId'));

  // Admin user
  const adminCtx = createTestContext({ sub: 'admin-1', role: 'admin' });
  const adminResult = await applyPolicy(policy, adminCtx, 'update');
  assertEquals(adminResult.allowed, true);
  assertEquals(adminResult.condition, undefined); // No filter for admin

  // Regular user
  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });
  const userResult = await applyPolicy(policy, userCtx, 'update');
  assertEquals(userResult.allowed, true);
  assertExists(userResult.condition); // Has ownership filter
});

Deno.test('unauthenticated user denied by ownedBy', async () => {
  const policy = ownedBy(posts, 'authorId');

  const anonCtx = createTestContext(); // No user
  const result = await applyPolicy(policy, anonCtx, 'update');
  assertEquals(result.allowed, false);
});

Deno.test('action-specific policy applies correct policy per action', async () => {
  // Different policies per action
  const policy = {
    list: always(),
    read: always(),
    create: authenticated(),
    update: adminOr(ownedBy(posts, 'authorId')),
    delete: never(),
  };

  const userCtx = createTestContext({ sub: 'user-1', role: 'editor' });

  // List allowed
  const listResult = await applyPolicy(policy, userCtx, 'list');
  assertEquals(listResult.allowed, true);

  // Create allowed (authenticated)
  const createResult = await applyPolicy(policy, userCtx, 'create');
  assertEquals(createResult.allowed, true);

  // Update allowed with filter
  const updateResult = await applyPolicy(policy, userCtx, 'update');
  assertEquals(updateResult.allowed, true);
  assertExists(updateResult.condition);

  // Delete denied
  const deleteResult = await applyPolicy(policy, userCtx, 'delete');
  assertEquals(deleteResult.allowed, false);
});
