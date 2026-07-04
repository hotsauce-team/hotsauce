// Micro-benchmarks: JWT sign/verify and cookie parsing — verifyJwt runs on
// every authenticated request. PBKDF2 password hashing and TOTP are
// deliberately excluded (slow by design / time-window dependent); see
// BENCHMARKS.md. Run with: deno task bench

import { createJwtPayload, signJwt, verifyJwt } from '../jwt.ts';
import { createAuthCookie, getTokenFromCookies } from '../cookies.ts';

const secret = 'bench-secret-0123456789abcdef0123456789abcdef';
const payload = createJwtPayload('42', 'user@example.com', 'admin');
const token = await signJwt(payload, secret);

Deno.bench('signJwt (HS256)', async () => {
  await signJwt(payload, secret);
});

Deno.bench('verifyJwt (HS256)', async () => {
  await verifyJwt(token, secret);
});

Deno.bench('createJwtPayload', () => {
  createJwtPayload('42', 'user@example.com', 'admin');
});

const request = new Request('http://localhost/admin', {
  headers: { Cookie: `theme=dark; cms_token=${token}; sidebar=open` },
});

Deno.bench('getTokenFromCookies: 3-cookie header', () => {
  getTokenFromCookies(request, 'cms_token');
});

Deno.bench('createAuthCookie', () => {
  createAuthCookie('cms_token', token, 3600, '/admin', true);
});
