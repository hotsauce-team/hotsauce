// Auth module exports
// JWT-based authentication for the CMS

// ─────────────────────────────────────────────────────────────
// JWT - Token signing and verification
// ─────────────────────────────────────────────────────────────
export type { JwtPayload } from './jwt.ts';
export { createJwtPayload, signJwt, verifyJwt } from './jwt.ts';

// ─────────────────────────────────────────────────────────────
// Password - Hashing and verification (PBKDF2)
// ─────────────────────────────────────────────────────────────
export { hashPassword, verifyPassword } from './password.ts';

// ─────────────────────────────────────────────────────────────
// Providers - Authentication backends
// ─────────────────────────────────────────────────────────────
export type {
  AuthProvider,
  AuthUser,
  PasswordCredentials,
  PasswordProviderOptions,
} from './provider.ts';
export { PasswordProvider } from './provider.ts';

// ─────────────────────────────────────────────────────────────
// Login UI - Login page rendering and styles
// ─────────────────────────────────────────────────────────────
export { loginStyles, renderLoginPage } from './login.ts';

// ─────────────────────────────────────────────────────────────
// Cookies - JWT cookie utilities
// ─────────────────────────────────────────────────────────────
export {
  createAuthCookie,
  createClearCookie,
  getTokenFromCookies,
  isSecureRequest,
} from './cookies.ts';
