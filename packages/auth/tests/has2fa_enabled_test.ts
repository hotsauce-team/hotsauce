// has2FAEnabled type guard tests

import { assertEquals } from '@std/assert';
import {
  type AccountRouteContext,
  type AccountRouteContextWith2FA,
  has2FAEnabled,
} from '../account/routes.ts';
import type { JwtPayload } from '../types.ts';
import type { PasswordProvider } from '../provider.ts';

// ─────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────

function createMockJwtPayload(): JwtPayload {
  return {
    sub: 'user-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
}

function createMockProvider(twoFactorEnabled: boolean): PasswordProvider {
  return {
    twoFactorEnabled,
    challengeSecret: twoFactorEnabled
      ? 'secret-at-least-32-characters-long!'
      : undefined,
    issuer: 'Test CMS',
  } as unknown as PasswordProvider;
}

function createMockContext(
  twoFactorEnabled: boolean,
  challengeSecret: string | undefined,
): AccountRouteContext {
  return {
    basePath: '/admin',
    title: 'Test CMS',
    jwtPayload: createMockJwtPayload(),
    provider: createMockProvider(twoFactorEnabled),
    csrfSecret: 'csrf-secret-at-least-32-characters-long',
    challengeSecret,
    generateCsrfToken: () => Promise.resolve('mock-csrf-token'),
    validateCsrfToken: () => Promise.resolve(true),
  };
}

// ─────────────────────────────────────────────────────────────
// has2FAEnabled tests
// ─────────────────────────────────────────────────────────────

Deno.test('has2FAEnabled: returns true when 2FA is enabled and challengeSecret is set', () => {
  const ctx = createMockContext(true, 'secret-at-least-32-characters-long!');

  assertEquals(has2FAEnabled(ctx), true);
});

Deno.test('has2FAEnabled: returns false when 2FA is disabled', () => {
  const ctx = createMockContext(false, undefined);

  assertEquals(has2FAEnabled(ctx), false);
});

Deno.test('has2FAEnabled: returns false when challengeSecret is undefined', () => {
  // Edge case: provider says 2FA enabled but secret missing
  const ctx: AccountRouteContext = {
    basePath: '/admin',
    title: 'Test CMS',
    jwtPayload: createMockJwtPayload(),
    provider: {
      twoFactorEnabled: true,
      challengeSecret: undefined,
      issuer: 'Test',
    } as unknown as PasswordProvider,
    csrfSecret: 'csrf-secret-at-least-32-characters-long',
    challengeSecret: undefined,
    generateCsrfToken: () => Promise.resolve('token'),
    validateCsrfToken: () => Promise.resolve(true),
  };

  assertEquals(has2FAEnabled(ctx), false);
});

Deno.test('has2FAEnabled: empty string challengeSecret still passes', () => {
  // Note: In practice this can't happen because provider constructor validates
  // that challengeSecret is ≥32 chars. This test documents the type guard's
  // behavior - it only checks for undefined, not empty string.
  const ctx = createMockContext(true, '');

  // Empty string is not undefined, so type guard passes
  // (provider-level validation prevents this in real code)
  assertEquals(has2FAEnabled(ctx), true);
});

Deno.test('has2FAEnabled: type narrowing works correctly', () => {
  const ctx = createMockContext(true, 'secret-at-least-32-characters-long!');

  if (has2FAEnabled(ctx)) {
    // After the guard, TypeScript knows challengeSecret is string
    const narrowed: AccountRouteContextWith2FA = ctx;
    const secret: string = narrowed.challengeSecret;

    // Verify the narrowed type has the expected value
    assertEquals(typeof secret, 'string');
    assertEquals(secret.length > 0, true);
  }
});

Deno.test('has2FAEnabled: allows using challengeSecret after guard', () => {
  const ctx = createMockContext(true, 'my-32-char-secret-for-2fa-tokens');

  if (has2FAEnabled(ctx)) {
    // This would be a TypeScript error without the type guard:
    // Cannot invoke toLowerCase on potentially undefined value
    const lowerSecret = ctx.challengeSecret.toLowerCase();
    assertEquals(lowerSecret, 'my-32-char-secret-for-2fa-tokens');
  }
});

Deno.test('has2FAEnabled: both conditions must be true', () => {
  // Test matrix of conditions
  const testCases: {
    twoFactorEnabled: boolean;
    secret: string | undefined;
    expected: boolean;
  }[] = [
    {
      twoFactorEnabled: true,
      secret: 'valid-secret-32-chars-minimum!',
      expected: true,
    },
    { twoFactorEnabled: true, secret: undefined, expected: false },
    {
      twoFactorEnabled: false,
      secret: 'valid-secret-32-chars-minimum!',
      expected: false,
    },
    { twoFactorEnabled: false, secret: undefined, expected: false },
  ];

  for (const { twoFactorEnabled, secret, expected } of testCases) {
    const ctx = createMockContext(twoFactorEnabled, secret);
    assertEquals(
      has2FAEnabled(ctx),
      expected,
      `Failed for twoFactorEnabled=${twoFactorEnabled}, secret=${secret}`,
    );
  }
});
