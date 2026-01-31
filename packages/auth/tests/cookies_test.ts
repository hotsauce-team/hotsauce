// Cookie utilities tests
// Tests for createAuthCookie, createClearCookie, getTokenFromCookies, isSecureRequest

import { assertEquals } from '@std/assert';
import {
  createAuthCookie,
  createClearCookie,
  getTokenFromCookies,
  isSecureRequest,
} from '../cookies.ts';

// ─────────────────────────────────────────────────────────────
// getTokenFromCookies tests
// ─────────────────────────────────────────────────────────────

Deno.test('getTokenFromCookies: returns token from Cookie header', () => {
  const request = new Request('http://localhost/', {
    headers: {
      Cookie: 'cms_token=abc123',
    },
  });

  const token = getTokenFromCookies(request, 'cms_token');
  assertEquals(token, 'abc123');
});

Deno.test('getTokenFromCookies: returns null when cookie not present', () => {
  const request = new Request('http://localhost/', {
    headers: {
      Cookie: 'other_cookie=xyz',
    },
  });

  const token = getTokenFromCookies(request, 'cms_token');
  assertEquals(token, null);
});

Deno.test('getTokenFromCookies: returns null when no Cookie header', () => {
  const request = new Request('http://localhost/');

  const token = getTokenFromCookies(request, 'cms_token');
  assertEquals(token, null);
});

Deno.test('getTokenFromCookies: handles multiple cookies', () => {
  const request = new Request('http://localhost/', {
    headers: {
      Cookie: 'first=1; cms_token=mytoken; last=3',
    },
  });

  const token = getTokenFromCookies(request, 'cms_token');
  assertEquals(token, 'mytoken');
});

Deno.test('getTokenFromCookies: handles JWT tokens with equals signs', () => {
  // JWTs can have = in base64 parts
  const jwtToken = 'eyJhbGciOiJIUzI1NiJ9.payload.sig==';
  const request = new Request('http://localhost/', {
    headers: {
      Cookie: `cms_token=${jwtToken}`,
    },
  });

  const token = getTokenFromCookies(request, 'cms_token');
  assertEquals(token, jwtToken);
});

Deno.test('getTokenFromCookies: handles cookies with whitespace', () => {
  const request = new Request('http://localhost/', {
    headers: {
      Cookie: '  cms_token=value  ;  other=123  ',
    },
  });

  const token = getTokenFromCookies(request, 'cms_token');
  // Each cookie is trimmed as a whole, so whitespace around = is removed
  assertEquals(token, 'value');
});

// ─────────────────────────────────────────────────────────────
// createAuthCookie tests
// ─────────────────────────────────────────────────────────────

Deno.test('createAuthCookie: creates cookie with all required parts', () => {
  const cookie = createAuthCookie('cms_token', 'abc123', 3600, '/admin', false);

  assertEquals(cookie.includes('cms_token=abc123'), true);
  assertEquals(cookie.includes('Path=/admin'), true);
  assertEquals(cookie.includes('Max-Age=3600'), true);
  assertEquals(cookie.includes('HttpOnly'), true);
  assertEquals(cookie.includes('SameSite=Lax'), true);
  assertEquals(cookie.includes('Secure'), false);
});

Deno.test('createAuthCookie: adds Secure flag when isSecure is true', () => {
  const cookie = createAuthCookie('cms_token', 'abc123', 3600, '/admin', true);

  assertEquals(cookie.includes('Secure'), true);
});

Deno.test('createAuthCookie: omits Secure flag when isSecure is false', () => {
  const cookie = createAuthCookie('cms_token', 'abc123', 3600, '/admin', false);

  assertEquals(cookie.includes('Secure'), false);
});

Deno.test('createAuthCookie: handles different max ages', () => {
  const shortCookie = createAuthCookie('t', 'v', 60, '/', false);
  const longCookie = createAuthCookie('t', 'v', 86400, '/', false);

  assertEquals(shortCookie.includes('Max-Age=60'), true);
  assertEquals(longCookie.includes('Max-Age=86400'), true);
});

Deno.test('createAuthCookie: handles custom paths', () => {
  const cookie1 = createAuthCookie('t', 'v', 3600, '/', false);
  const cookie2 = createAuthCookie('t', 'v', 3600, '/cms/admin', false);

  assertEquals(cookie1.includes('Path=/'), true);
  assertEquals(cookie2.includes('Path=/cms/admin'), true);
});

// ─────────────────────────────────────────────────────────────
// createClearCookie tests
// ─────────────────────────────────────────────────────────────

Deno.test('createClearCookie: creates cookie that clears token', () => {
  const cookie = createClearCookie('cms_token', '/admin', false);

  assertEquals(cookie.includes('cms_token='), true);
  assertEquals(cookie.includes('Max-Age=0'), true);
  assertEquals(cookie.includes('Path=/admin'), true);
  assertEquals(cookie.includes('HttpOnly'), true);
  assertEquals(cookie.includes('SameSite=Lax'), true);
});

Deno.test('createClearCookie: adds Secure when isSecure is true', () => {
  const cookie = createClearCookie('cms_token', '/admin', true);

  assertEquals(cookie.includes('Secure'), true);
});

Deno.test('createClearCookie: omits Secure when isSecure is false', () => {
  const cookie = createClearCookie('cms_token', '/admin', false);

  assertEquals(cookie.includes('Secure'), false);
});

Deno.test('createClearCookie: sets empty value', () => {
  const cookie = createClearCookie('cms_token', '/admin', false);
  // Cookie should be cms_token= with no value after equals
  const parts = cookie.split('; ');
  const namePart = parts.find((p) => p.startsWith('cms_token='));
  assertEquals(namePart, 'cms_token=');
});

// ─────────────────────────────────────────────────────────────
// isSecureRequest tests
// ─────────────────────────────────────────────────────────────

Deno.test('isSecureRequest: returns true for X-Forwarded-Proto: https', () => {
  const request = new Request('http://localhost/', {
    headers: {
      'X-Forwarded-Proto': 'https',
    },
  });

  assertEquals(isSecureRequest(request), true);
});

Deno.test('isSecureRequest: returns false for X-Forwarded-Proto: http', () => {
  const request = new Request('http://localhost/', {
    headers: {
      'X-Forwarded-Proto': 'http',
    },
  });

  assertEquals(isSecureRequest(request), false);
});

Deno.test('isSecureRequest: handles uppercase X-Forwarded-Proto', () => {
  const request = new Request('http://localhost/', {
    headers: {
      'X-Forwarded-Proto': 'HTTPS',
    },
  });

  assertEquals(isSecureRequest(request), true);
});

Deno.test('isSecureRequest: falls back to URL protocol for direct connections', () => {
  const httpsRequest = new Request('https://example.com/');
  const httpRequest = new Request('http://example.com/');

  assertEquals(isSecureRequest(httpsRequest), true);
  assertEquals(isSecureRequest(httpRequest), false);
});

Deno.test('isSecureRequest: X-Forwarded-Proto takes precedence over URL', () => {
  // This simulates a TLS-terminating proxy:
  // HTTPS from client → proxy → HTTP to server
  const request = new Request('http://localhost/', {
    headers: {
      'X-Forwarded-Proto': 'https',
    },
  });

  assertEquals(isSecureRequest(request), true);
});

Deno.test('isSecureRequest: handles localhost without proxy headers', () => {
  const request = new Request('http://localhost:8000/');

  assertEquals(isSecureRequest(request), false);
});
