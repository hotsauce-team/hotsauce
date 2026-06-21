// Dashboard Policy Tests
// Verifies that dashboard correctly:
// 1. Hides tables when row policy returns allowed: false
// 2. Filters counts using row policy conditions (prevents count leakage)

import { assertEquals, assertStringIncludes } from '@std/assert';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import {
  createBasicTables,
  posts,
  schemaWithAuth,
  TEST_CSRF_SECRET,
  users,
} from './integration_helpers.ts';
import { ownedBy, roleIs } from '../mod.ts';
import { handleDashboard, handleList } from '../crud.ts';
import { type IntrospectedTable, introspectFullSchema } from '@hotsauce/core';
import type {
  ParsedRoute,
  ResolvedCmsOptions,
  RouteContext,
} from '../types.ts';

// ============================================================================
// Test Helper: Build RouteContext for handleDashboard
// ============================================================================

function buildDashboardContext(
  // deno-lint-ignore no-explicit-any
  db: any,
  // deno-lint-ignore no-explicit-any
  schema: any,
  policies: ResolvedCmsOptions['policies'],
  authUser?: { id: string; role?: string },
): RouteContext {
  const introspected = introspectFullSchema(schema);
  const url = new URL('http://localhost/admin');
  const request = new Request(url);

  const options: ResolvedCmsOptions = {
    introspected,
    db,
    basePath: '/admin',
    title: 'Test CMS',
    csrfSecret: TEST_CSRF_SECRET,
    isAuthenticated: () => !!authUser,
    canAccess: () => true,
    parsers: {},
    policies,
    auth: authUser
      ? {
        secret: 'not-used-for-dashboard-test-must-be-32-chars',
        provider: {} as never, // Not needed for dashboard
        maxAge: 3600,
        cookieName: 'cms_token',
        loginTitle: 'Login',
        identityLabel: 'Email',
      }
      : undefined,
    securityHeaders: {},
    routeSecurityHeaders: new Map(),
  };

  const route: ParsedRoute = {
    table: null,
    action: 'dashboard',
  };

  return {
    request,
    options,
    route,
    url,
    authUser: authUser ? { id: authUser.id, role: authUser.role } : undefined,
  };
}

/**
 * Build a RouteContext for handleList
 */
function buildListContext(
  // deno-lint-ignore no-explicit-any
  db: any,
  // deno-lint-ignore no-explicit-any
  schema: any,
  tableName: string,
  policies: ResolvedCmsOptions['policies'],
  authUser?: { id: string; role?: string },
): RouteContext {
  const introspected = introspectFullSchema(schema);
  const table = introspected.tables.find((t) => t.name === tableName);
  if (!table) throw new Error(`Table ${tableName} not found`);

  const url = new URL(`http://localhost/admin/${tableName}`);
  const request = new Request(url);

  const options: ResolvedCmsOptions = {
    introspected,
    db,
    basePath: '/admin',
    title: 'Test CMS',
    csrfSecret: TEST_CSRF_SECRET,
    isAuthenticated: () => !!authUser,
    canAccess: () => true,
    parsers: {},
    policies,
    auth: authUser
      ? {
        secret: 'not-used-for-list-test-must-be-32-chars-',
        provider: {} as never,
        maxAge: 3600,
        cookieName: 'cms_token',
        loginTitle: 'Login',
        identityLabel: 'Email',
      }
      : undefined,
    securityHeaders: {},
    routeSecurityHeaders: new Map(),
  };

  const route: ParsedRoute = {
    table: table as IntrospectedTable,
    action: 'list',
  };

  return {
    request,
    options,
    route,
    url,
    authUser: authUser ? { id: authUser.id, role: authUser.role } : undefined,
  };
}

// ============================================================================
// Dashboard Policy Tests
// ============================================================================

Deno.test({
  name: 'dashboard: policy-filtered counts',
  sanitizeOps: false,
  fn: async (t) => {
    const client = new PGlite();
    try {
      const db = drizzle(client, { schema: schemaWithAuth });

      await createBasicTables(db);

      const resetDb = async () => {
        await db.execute(
          sql`TRUNCATE TABLE posts, users RESTART IDENTITY CASCADE`,
        );
      };

      await t.step('counts filtered by ownedBy policy', async () => {
        await resetDb();

        // Create two users
        await db.insert(users).values([
          { email: 'alice@example.com', name: 'Alice' },
          { email: 'bob@example.com', name: 'Bob' },
        ]);

        // Create posts: 3 by Alice (user 1), 7 by Bob (user 2)
        await db.insert(posts).values([
          { title: 'Alice Post 1', authorId: 1 },
          { title: 'Alice Post 2', authorId: 1 },
          { title: 'Alice Post 3', authorId: 1 },
          { title: 'Bob Post 1', authorId: 2 },
          { title: 'Bob Post 2', authorId: 2 },
          { title: 'Bob Post 3', authorId: 2 },
          { title: 'Bob Post 4', authorId: 2 },
          { title: 'Bob Post 5', authorId: 2 },
          { title: 'Bob Post 6', authorId: 2 },
          { title: 'Bob Post 7', authorId: 2 },
        ]);

        // Call handleDashboard directly with Alice (user 1) context
        const ctx = buildDashboardContext(
          db,
          schemaWithAuth,
          {
            // Posts filtered by owner - Alice should only see her 3 posts
            posts: ownedBy(posts, 'authorId'),
            // Users table has no policy - full access
          },
          { id: '1' }, // Alice as user 1
        );

        const response = await handleDashboard(ctx);
        assertEquals(response.status, 200);

        const html = await response.text();

        // Should show "3 records" for posts (Alice's posts only), not "10 records"
        assertStringIncludes(html, 'Posts');
        assertStringIncludes(html, '3 records'); // Alice's posts only

        // Users table should show all 2 users (no policy = full access)
        assertStringIncludes(html, 'Users');
        assertStringIncludes(html, '2 records');
      });

      await t.step(
        'table hidden when policy returns allowed: false',
        async () => {
          await resetDb();

          // Create regular user
          await db.insert(users).values({
            email: 'regular@example.com',
            name: 'Regular User',
          });

          // Call handleDashboard with non-admin user (role: 'editor')
          const ctx = buildDashboardContext(
            db,
            schemaWithAuth,
            {
              // Users table only visible to admins
              users: roleIs('admin'),
              // Posts table visible to everyone (no policy = full access)
            },
            { id: '1', role: 'editor' }, // Non-admin user
          );

          const response = await handleDashboard(ctx);
          assertEquals(response.status, 200);

          const html = await response.text();

          // Posts should be visible (0 posts, no policy)
          assertStringIncludes(html, 'Posts');

          // Users should NOT be visible (roleIs('admin') policy, user is 'editor')
          // Check that "Users" does not appear in the table cards
          const tableGridMatch = html.match(
            /<div class="cms-table-grid">([\s\S]*?)<\/div>/,
          );
          const tableGrid = tableGridMatch?.[1] ?? '';
          assertEquals(
            tableGrid.includes('>Users<'),
            false,
            'Users table should not appear in dashboard cards for non-admin',
          );
        },
      );

      await t.step(
        'no policies = no policy filtering (full counts)',
        async () => {
          await resetDb();

          // Create users and posts
          await db.insert(users).values([
            { email: 'alice@example.com', name: 'Alice' },
            { email: 'bob@example.com', name: 'Bob' },
          ]);

          await db.insert(posts).values([
            { title: 'Post 1', authorId: 1 },
            { title: 'Post 2', authorId: 1 },
            { title: 'Post 3', authorId: 2 },
          ]);

          // Call handleDashboard with empty policies (equivalent to 'dangerously-open')
          // When policies is {}, no table has a policy, so all get full access
          const introspected = introspectFullSchema(schemaWithAuth);
          const url = new URL('http://localhost/admin');
          const request = new Request(url);

          const options: ResolvedCmsOptions = {
            introspected,
            db,
            basePath: '/admin',
            title: 'Test CMS',
            csrfSecret: TEST_CSRF_SECRET,
            isAuthenticated: () => true,
            canAccess: () => true,
            parsers: {},
            policies: {}, // Empty policies = full access to all tables
            securityHeaders: {},
            routeSecurityHeaders: new Map(),
          };

          const route: ParsedRoute = { table: null, action: 'dashboard' };
          const ctx: RouteContext = { request, options, route, url };

          const response = await handleDashboard(ctx);
          assertEquals(response.status, 200);

          const html = await response.text();

          // Should show full counts (no policy filtering)
          assertStringIncludes(html, '2 records'); // All users
          assertStringIncludes(html, '3 records'); // All posts
        },
      );
    } finally {
      client.close();
    }
  },
});

// ============================================================================
// Sidebar Policy Tests (via handleList)
// ============================================================================

Deno.test({
  name: 'sidebar: policy-filtered navigation',
  sanitizeOps: false,
  fn: async (t) => {
    const client = new PGlite();
    try {
      const db = drizzle(client, { schema: schemaWithAuth });

      await createBasicTables(db);

      await t.step(
        'sidebar hides tables when policy returns allowed: false',
        async () => {
          // Call handleList on posts table as an editor
          // The users table has roleIs('admin') policy - should be hidden from sidebar
          const ctx = buildListContext(
            db,
            schemaWithAuth,
            'posts',
            {
              // Users table only visible to admins
              users: roleIs('admin'),
              // Posts table visible to everyone
            },
            { id: '1', role: 'editor' }, // Non-admin user
          );

          const response = await handleList(ctx);
          assertEquals(response.status, 200);

          const html = await response.text();

          // Sidebar should show Posts (we're viewing it)
          // Extract the sidebar navigation
          const sidebarMatch = html.match(
            /<aside[^>]*class="cms-sidebar"[^>]*>([\s\S]*?)<\/aside>/,
          );
          const sidebar = sidebarMatch?.[1] ?? '';

          // Posts should be in sidebar (we have access)
          assertStringIncludes(sidebar, '>Posts<');

          // Users should NOT be in sidebar (roleIs('admin') policy, user is 'editor')
          assertEquals(
            sidebar.includes('>Users<'),
            false,
            'Users table should not appear in sidebar for non-admin',
          );
        },
      );

      await t.step(
        'sidebar shows all tables when user has admin role',
        async () => {
          // Call handleList on posts table as an admin
          const ctx = buildListContext(
            db,
            schemaWithAuth,
            'posts',
            {
              // Users table only visible to admins
              users: roleIs('admin'),
            },
            { id: '1', role: 'admin' }, // Admin user
          );

          const response = await handleList(ctx);
          assertEquals(response.status, 200);

          const html = await response.text();

          // Extract the sidebar navigation
          const sidebarMatch = html.match(
            /<aside[^>]*class="cms-sidebar"[^>]*>([\s\S]*?)<\/aside>/,
          );
          const sidebar = sidebarMatch?.[1] ?? '';

          // Both tables should be in sidebar for admin
          assertStringIncludes(sidebar, '>Posts<');
          assertStringIncludes(sidebar, '>Users<');
        },
      );
    } finally {
      client.close();
    }
  },
});
