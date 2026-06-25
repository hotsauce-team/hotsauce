// @hotsauce/auth
// Authentication package for the CMS
// Includes JWT, password hashing, TOTP 2FA, and account management

// ─────────────────────────────────────────────────────────────
// Types - Core auth types and interfaces
// ─────────────────────────────────────────────────────────────
export type {
  AuthProvider,
  AuthResult,
  AuthUser,
  JwtPayload,
  PasswordCredentials,
  TwoFactorCredentials,
} from './types.ts';

// ─────────────────────────────────────────────────────────────
// Provider - Password authentication with optional 2FA
// ─────────────────────────────────────────────────────────────
export { PasswordProvider, type PasswordProviderOptions } from './provider.ts';

// ─────────────────────────────────────────────────────────────
// JWT - Token signing and verification
// ─────────────────────────────────────────────────────────────
export { createJwtPayload, signJwt, verifyJwt } from './jwt.ts';

// ─────────────────────────────────────────────────────────────
// Password - Hashing and verification (PBKDF2)
// ─────────────────────────────────────────────────────────────
export { hashPassword, verifyPassword } from './password.ts';

// ─────────────────────────────────────────────────────────────
// TOTP - Time-based One-Time Passwords (RFC 6238)
// ─────────────────────────────────────────────────────────────
export {
  generateTOTP,
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
} from './totp.ts';

// ─────────────────────────────────────────────────────────────
// Challenge tokens - Signed tokens for 2FA verification
// ─────────────────────────────────────────────────────────────
export {
  createChallengeToken,
  decryptTokenData,
  encryptTokenData,
  verifyChallengeToken,
} from './challenge.ts';

// ─────────────────────────────────────────────────────────────
// Cookies - JWT cookie utilities
// ─────────────────────────────────────────────────────────────
export {
  createAuthCookie,
  createClearCookie,
  getTokenFromCookies,
  isSecureRequest,
} from './cookies.ts';
export type { SameSite } from './cookies.ts';

// ─────────────────────────────────────────────────────────────
// Login UI - Login page rendering and styles
// ─────────────────────────────────────────────────────────────
export { loginStyles, renderLoginPage, twoFactorStyles } from './login.ts';

// ─────────────────────────────────────────────────────────────
// Account - Self-service account management
// ─────────────────────────────────────────────────────────────
export {
  type AccountRouteContext,
  type AccountRouteContextWith2FA,
  accountStyles,
  handle2FADisable,
  handle2FAEnable,
  handle2FASetupForm,
  handleAccountPage,
  handlePasswordChange,
  handlePasswordChangeForm,
  has2FAEnabled,
  render2FADisablePage,
  render2FASetupPage,
  renderAccountPage,
  renderPasswordChangePage,
} from './account/mod.ts';
