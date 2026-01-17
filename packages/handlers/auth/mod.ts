// Auth module exports
// JWT-based authentication for the CMS

// ─────────────────────────────────────────────────────────────
// JWT - Token signing and verification
// ─────────────────────────────────────────────────────────────
export type { JwtPayload } from './jwt.ts';
export { signJwt, verifyJwt, createJwtPayload } from './jwt.ts';

// ─────────────────────────────────────────────────────────────
// Password - Hashing and verification (PBKDF2)
// ─────────────────────────────────────────────────────────────
export { hashPassword, verifyPassword } from './password.ts';

// ─────────────────────────────────────────────────────────────
// Providers - Authentication backends
// ─────────────────────────────────────────────────────────────
export type {
  AuthUser,
  AuthProvider,
  PasswordCredentials,
  PasswordProviderOptions,
} from './provider.ts';
export { PasswordProvider } from './provider.ts';

// ─────────────────────────────────────────────────────────────
// Login UI - Login page rendering and styles
// ─────────────────────────────────────────────────────────────
export { renderLoginPage, loginStyles } from './login.ts';

// ─────────────────────────────────────────────────────────────
// Cookies - JWT cookie utilities
// ─────────────────────────────────────────────────────────────
export {
  getTokenFromCookies,
  createAuthCookie,
  createClearCookie,
  isSecureRequest,
} from './cookies.ts';
