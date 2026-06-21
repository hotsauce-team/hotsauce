// Tests for layout component

import { assertStringIncludes } from '@std/assert';
import { layout } from '../components/layout.ts';

Deno.test('layout: renders basic page structure', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    siteName: 'Test CMS',
  });

  assertStringIncludes(result, '<!DOCTYPE html>');
  assertStringIncludes(result, '<title>');
  assertStringIncludes(result, 'Test Page');
  assertStringIncludes(result, 'Test CMS');
  assertStringIncludes(result, '<p>Content</p>');
});

Deno.test('layout: renders navigation items', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    nav: [
      { label: 'Posts', href: '/admin/posts', active: true },
      { label: 'Users', href: '/admin/users' },
    ],
  });

  assertStringIncludes(result, '<ul class="cms-nav">');
  assertStringIncludes(result, 'Posts');
  assertStringIncludes(result, '/admin/posts');
  assertStringIncludes(result, 'Users');
  assertStringIncludes(result, '/admin/users');
  assertStringIncludes(result, 'active');
});

Deno.test('layout: renders user info with logout button', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    user: {
      name: 'John Doe',
      logoutUrl: '/admin/logout',
    },
  });

  assertStringIncludes(result, 'John Doe');
  assertStringIncludes(result, '<form method="POST" action="/admin/logout"');
  assertStringIncludes(result, '<button type="submit"');
  assertStringIncludes(result, 'Logout');
});

Deno.test('layout: renders account link when accountUrl provided', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    user: {
      name: 'John Doe',
      logoutUrl: '/admin/logout',
      accountUrl: '/admin/account',
    },
  });

  // Account link should be a proper anchor tag styled as a button
  assertStringIncludes(result, '<a href="/admin/account"');
  assertStringIncludes(result, 'class="cms-btn cms-btn-secondary"');
  assertStringIncludes(result, '>Account</a>');
});

Deno.test('layout: does not render account link when accountUrl not provided', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    user: {
      name: 'John Doe',
      logoutUrl: '/admin/logout',
    },
  });

  // Should not contain account link
  const hasAccountLink = result.includes('href="/admin/account"') ||
    result.includes('>Account</a>');
  if (hasAccountLink) {
    throw new Error(
      'Account link should not be rendered when accountUrl is not provided',
    );
  }
});

Deno.test('layout: escapes user name to prevent XSS', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    user: {
      name: '<script>alert("xss")</script>',
      logoutUrl: '/admin/logout',
    },
  });

  // Script tags should be escaped
  assertStringIncludes(result, '&lt;script&gt;');
  // Should not contain raw script tag
  if (result.includes('<script>alert')) {
    throw new Error('User name should be escaped to prevent XSS');
  }
});

Deno.test('layout: includes stylesheet link', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
    stylesheetUrl: '/admin/styles.css',
  });

  assertStringIncludes(
    result,
    '<link rel="stylesheet" href="/admin/styles.css">',
  );
});

Deno.test('layout: sidebar has popover attribute and id for mobile navigation', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
  });

  // Sidebar should have id="cms-nav" and popover attribute
  // Use specific assertion to avoid matching popovertarget="cms-nav"
  assertStringIncludes(
    result,
    '<aside id="cms-nav" class="cms-sidebar" popover>',
  );
});

Deno.test('layout: menu toggle has correct accessibility attributes', () => {
  const result = layout('<p>Content</p>', {
    title: 'Test Page',
  });

  // Toggle button should have all required attributes
  // Assert the full button tag to ensure we're testing the correct element
  assertStringIncludes(
    result,
    '<button type="button" class="cms-menu-toggle" popovertarget="cms-nav" aria-controls="cms-nav" aria-label="Menu">',
  );
  // SVG should be aria-hidden
  assertStringIncludes(result, 'aria-hidden="true"');
});
