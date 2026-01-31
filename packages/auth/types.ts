// Auth types and interfaces
// Core types used across the auth package

/**
 * Authenticated user info (stored in JWT)
 */
export interface AuthUser {
  /** User identifier (stored in JWT 'sub' claim) */
  id: string | number;
  /** User identity - email/username (stored in JWT 'identity' claim) */
  identity: string;
  /** User role (stored in JWT 'role' claim) */
  role?: string;
}

/**
 * Authentication result - tagged union for different outcomes
 *
 * - `authenticated`: User is fully authenticated, ready for JWT
 * - `pending_2fa`: Password verified, awaiting TOTP code
 * - `null`: Authentication failed (invalid credentials)
 */
export type AuthResult =
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'pending_2fa'; userId: string | number; challenge: string }
  | null;

/**
 * Auth provider interface
 *
 * Implement this to support different authentication methods:
 * - Password-based (built-in)
 * - OAuth (user implements)
 * - API keys (user implements)
 * - LDAP (user implements)
 */
export interface AuthProvider {
  /**
   * Authenticate credentials and return result
   * @param credentials - Provider-specific credentials
   * @returns AuthResult: authenticated user, pending 2FA, or null if invalid
   */
  authenticate(credentials: unknown): Promise<AuthResult>;

  /**
   * Optional: Render custom login form HTML
   * If not provided, default password form is used
   */
  renderLoginForm?(error?: string, basePath?: string): string;

  /**
   * Optional: Parse credentials from request
   * Default: { identity, password } from form data
   */
  parseCredentials?(request: Request): Promise<unknown>;

  /**
   * Render the TOTP verification form (required for 2FA support)
   * Called by handler when user is in pending 2FA state
   */
  renderTotpForm?(options: {
    basePath: string;
    title: string;
    error?: string;
    challengeToken: string;
    csrfToken: string;
  }): string;

  /**
   * Get user info by ID (used for account pages)
   */
  getUser?(userId: string | number): Promise<AuthUser | null>;

  /**
   * Update user's password (used for account pages)
   */
  setPassword?(userId: string | number, passwordHash: string): Promise<void>;

  /**
   * Update user's TOTP secret (used for 2FA setup/disable)
   * Pass null to disable 2FA
   */
  setTotpSecret?(userId: string | number, secret: string | null): Promise<void>;

  /**
   * Get user's current TOTP secret (for checking if 2FA is enabled)
   */
  getTotpSecret?(userId: string | number): Promise<string | null>;

  /**
   * Application name for authenticator apps
   */
  readonly issuer?: string;
}

/**
 * Password credentials (default)
 */
export interface PasswordCredentials {
  identity: string; // email, username, etc.
  password: string;
}

/**
 * Credentials for two-factor authentication
 */
export interface TwoFactorCredentials extends PasswordCredentials {
  /** TOTP code (6 digits) - present in phase 2 */
  totpCode?: string;
  /** Signed challenge token from phase 1 */
  challengeToken?: string;
}

/**
 * JWT payload claims
 */
export interface JwtPayload {
  /** Subject - typically user ID */
  sub: string;
  /** User identity - email/username */
  identity?: string;
  /** User role (optional) */
  role?: string;
  /** Issued at (unix timestamp in seconds) */
  iat: number;
  /** Expires at (unix timestamp in seconds) */
  exp: number;
  /** Custom claims */
  [key: string]: unknown;
}
