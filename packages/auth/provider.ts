// Password authentication provider with optional TOTP two-factor authentication
// Password authentication provider with optional TOTP 2FA support

import { eq } from 'drizzle-orm';
import { attrs, html, raw } from '@hotsauce/ui';
import { layout } from '@hotsauce/ui';
import type {
  AuthProvider,
  AuthResult,
  AuthUser,
  PasswordCredentials,
  TwoFactorCredentials,
} from './types.ts';
import { verifyPassword } from './password.ts';
import { verifyTOTP } from './totp.ts';
import { createChallengeToken, verifyChallengeToken } from './challenge.ts';

/**
 * Cross-runtime environment variable access
 * Works in Deno, Node.js, Bun, and Cloudflare Workers
 */
function getEnv(key: string): string | undefined {
  // Deno
  // deno-lint-ignore no-explicit-any
  if (typeof (globalThis as any).Deno !== 'undefined') {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno.env.get(key);
  }
  // Node.js / Bun (both have process.env)
  // deno-lint-ignore no-explicit-any
  if (typeof (globalThis as any).process !== 'undefined') {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).process.env[key];
  }
  // Cloudflare Workers / Edge - env vars are typically bound to globalThis
  // deno-lint-ignore no-explicit-any
  return (globalThis as any)[key];
}

/**
 * Options for PasswordProvider
 */
export interface PasswordProviderOptions {
  /** Drizzle database instance */
  // deno-lint-ignore no-explicit-any
  db: any;

  /** Drizzle table containing users */
  // deno-lint-ignore no-explicit-any
  usersTable: any;

  /** Column name for identity (email/username). Default: 'email' */
  identityColumn?: string;

  /** Column name for password hash. Default: 'passwordHash' */
  passwordColumn?: string;

  /** Column name for user role (optional) */
  roleColumn?: string;

  /** Column name for primary key. Default: 'id' */
  idColumn?: string;

  /**
   * Column name for TOTP secret.
   * If provided, enables 2FA capability for users who have a secret set.
   * Users without a secret skip 2FA. Default: 'totpSecret'
   */
  totpSecretColumn?: string;

  /** Application name shown in authenticator apps. Default: 'CMS' */
  issuer?: string;

  /**
   * Secret for signing 2FA challenge tokens (32+ chars).
   * If not provided, falls back to CMS_2FA_SECRET environment variable.
   * Required only if totpSecretColumn is configured.
   */
  challengeSecret?: string;
}

/**
 * Password-based authentication provider with optional TOTP two-factor authentication
 *
 * Features:
 * - Password authentication against a Drizzle users table
 * - Optional TOTP two-factor authentication (per-user)
 * - Signed challenge tokens for secure 2FA flow
 * - Account management methods for password/2FA changes
 *
 * Two-phase authentication flow (when user has 2FA enabled):
 * 1. User submits email/password → if valid and 2FA enabled, returns pending_2fa with signed challenge
 * 2. User submits TOTP code + challenge token → if valid, returns authenticated user
 *
 * Users without a TOTP secret configured skip phase 2.
 *
 * Security features:
 * - Challenge token is signed and time-limited (5 minutes)
 * - Token binds to specific user ID, preventing reuse
 * - Rate limiting should be implemented by the server (e.g., fail2ban, middleware)
 *
 * Environment variables:
 * - CMS_2FA_SECRET: Fallback for challengeSecret option (32+ chars)
 *
 * @example
 * ```ts
 * // Minimal config - 2FA disabled
 * const provider = new PasswordProvider({
 *   db,
 *   usersTable: schema.admins,
 * });
 *
 * // With 2FA enabled (uses CMS_2FA_SECRET from env)
 * const provider = new PasswordProvider({
 *   db,
 *   usersTable: schema.admins,
 *   totpSecretColumn: 'totpSecret',
 *   issuer: 'My CMS',
 * });
 *
 * // Full config
 * const provider = new PasswordProvider({
 *   db,
 *   usersTable: schema.users,
 *   identityColumn: 'username',
 *   passwordColumn: 'password_hash',
 *   roleColumn: 'user_role',
 *   totpSecretColumn: 'two_factor_secret',
 *   issuer: 'My App',
 *   challengeSecret: 'my-secret-at-least-32-characters-long',
 * });
 * ```
 */
export class PasswordProvider implements AuthProvider {
  // deno-lint-ignore no-explicit-any
  protected db: any;
  // deno-lint-ignore no-explicit-any
  protected usersTable: any;
  protected identityColumn: string;
  protected passwordColumn: string;
  protected roleColumn?: string;
  protected idColumn: string;
  protected totpSecretColumn?: string;
  private _challengeSecret?: string;

  /** Application name for authenticator apps (used in 2FA setup flow) */
  readonly issuer: string;

  /** Whether 2FA is enabled (totpSecretColumn is configured) */
  readonly twoFactorEnabled: boolean;

  /**
   * Secret used for 2FA challenge tokens (undefined if 2FA disabled)
   * This is needed by account route handlers for token signing/verification
   */
  get challengeSecret(): string | undefined {
    return this._challengeSecret;
  }

  constructor(options: PasswordProviderOptions) {
    this.db = options.db;
    this.usersTable = options.usersTable;
    this.identityColumn = options.identityColumn ?? 'email';
    this.passwordColumn = options.passwordColumn ?? 'passwordHash';
    this.idColumn = options.idColumn ?? 'id';
    this.roleColumn = options.roleColumn ?? 'role';
    this.totpSecretColumn = options.totpSecretColumn ?? 'totpSecret';
    this.issuer = options.issuer ?? 'CMS';

    // Validate that required columns exist on the table
    if (!this.usersTable[this.identityColumn]) {
      throw new Error(
        `PasswordProvider: identity column '${this.identityColumn}' not found on users table`,
      );
    }
    if (!this.usersTable[this.passwordColumn]) {
      throw new Error(
        `PasswordProvider: password column '${this.passwordColumn}' not found on users table`,
      );
    }
    if (!this.usersTable[this.idColumn]) {
      throw new Error(
        `PasswordProvider: id column '${this.idColumn}' not found on users table`,
      );
    }

    // Check if 2FA column exists on the table
    this.twoFactorEnabled = this.totpSecretColumn !== undefined &&
      !!this.usersTable[this.totpSecretColumn];

    // Resolve challenge secret if 2FA is enabled
    if (this.twoFactorEnabled) {
      const challengeSecret = options.challengeSecret ??
        getEnv('CMS_2FA_SECRET');

      if (!challengeSecret || challengeSecret.length < 32) {
        throw new Error(
          'PasswordProvider: challengeSecret must be at least 32 characters when 2FA is enabled. ' +
            'Either pass challengeSecret option or set CMS_2FA_SECRET environment variable.',
        );
      }
      this._challengeSecret = challengeSecret;
    }
  }

  async authenticate(credentials: unknown): Promise<AuthResult> {
    const creds = credentials as TwoFactorCredentials;

    // Phase 2: TOTP verification with signed challenge
    if (creds.totpCode && creds.challengeToken && this._challengeSecret) {
      const userId = await verifyChallengeToken(
        creds.challengeToken,
        this._challengeSecret,
      );

      if (!userId) {
        return null;
      }

      return this.verifyTotpPhase(userId, creds.totpCode);
    }

    // Phase 1: Password verification
    const { identity, password } = creds as PasswordCredentials;
    if (!identity || !password) {
      return null;
    }

    try {
      // Query user by identity column
      const identityCol = this.usersTable[this.identityColumn];
      const results = await this.db
        .select()
        .from(this.usersTable)
        .where(eq(identityCol, identity))
        .limit(1);

      const user = results[0] as Record<string, unknown> | undefined;
      if (!user) {
        return null;
      }

      // Verify password
      const storedHash = user[this.passwordColumn] as string | undefined;
      const dummyHash =
        '$pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const valid = await verifyPassword(password, storedHash ?? dummyHash);
      if (!valid || !storedHash) {
        return null;
      }

      // Check if user has 2FA enabled
      if (this.twoFactorEnabled && this.totpSecretColumn) {
        const totpSecret = user[this.totpSecretColumn] as string | null;

        if (totpSecret && this._challengeSecret) {
          // Create signed challenge token for phase 2
          const userId = user[this.idColumn] as string | number;
          const challenge = await createChallengeToken(
            userId,
            this._challengeSecret,
          );

          return {
            status: 'pending_2fa',
            userId,
            challenge,
          };
        }
      }

      // No 2FA configured - return full auth
      return {
        status: 'authenticated',
        user: {
          id: user[this.idColumn] as string | number,
          identity: user[this.identityColumn] as string,
          role: this.roleColumn
            ? (user[this.roleColumn] as string | undefined)
            : undefined,
        },
      };
    } catch {
      return null;
    }
  }

  async parseCredentials(
    request: Request,
  ): Promise<TwoFactorCredentials | null> {
    try {
      const formData = await request.formData();

      // Check if this is phase 2 (TOTP submission)
      const totpCode = formData.get('totp_code') as string | null;
      const challengeToken = formData.get('challenge_token') as string | null;

      if (totpCode && challengeToken) {
        return {
          identity: '',
          password: '',
          totpCode: totpCode.replace(/\s/g, ''),
          challengeToken,
        };
      }

      // Phase 1: password submission
      const identity = formData.get('identity') as string | null;
      const password = formData.get('password') as string | null;

      if (!identity || !password) {
        return null;
      }

      return { identity, password };
    } catch {
      return null;
    }
  }

  renderLoginForm(_error?: string, _basePath?: string): string {
    return '';
  }

  /**
   * Render the TOTP verification form
   * Called by handler when user is in pending 2FA state
   */
  renderTotpForm(options: {
    basePath: string;
    title: string;
    error?: string;
    challengeToken: string;
    csrfToken: string;
  }): string {
    const { basePath, title, error, challengeToken, csrfToken } = options;

    const formContent = html`
      <div class="cms-login-container">
        <div class="cms-login-box">
          <h1 class="cms-login-title">Two-Factor Authentication</h1>
          <p class="cms-login-subtitle">
            Enter the 6-digit code from your authenticator app
          </p>

          ${error
            ? raw(html`
              <div class="cms-alert cms-alert-error">
                ${error}
              </div>
            `)
            : ''}

          <form method="POST" action="${basePath}/login" class="cms-login-form">
            <input type="hidden" name="_csrf" value="${csrfToken}" />
            <input type="hidden" name="challenge_token" value="${challengeToken}" />

            <div class="cms-form-field">
              <label for="totp_code" class="cms-label">Verification Code</label>
              <input
                ${attrs({
                  type: 'text',
                  id: 'totp_code',
                  name: 'totp_code',
                  placeholder: '000000',
                  required: true,
                  autocomplete: 'one-time-code',
                  autofocus: true,
                  pattern: '[0-9]{6}',
                  maxlength: '6',
                  inputmode: 'numeric',
                })}
                class="cms-input cms-input-totp"
              />
            </div>

            <button type="submit" class="cms-btn cms-btn-primary cms-login-btn">
              Verify
            </button>
          </form>

          <div class="cms-login-footer">
            <a href="${basePath}/login" class="cms-link">← Back to login</a>
          </div>
        </div>
      </div>
    `;

    return layout(formContent, {
      title: `Verify - ${title}`,
      siteName: title,
      nav: [],
      stylesheetUrl: `${basePath}/styles.css`,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Account management methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Get user info by ID
   */
  async getUser(userId: string | number): Promise<AuthUser | null> {
    try {
      const idCol = this.usersTable[this.idColumn];
      const results = await this.db
        .select()
        .from(this.usersTable)
        .where(eq(idCol, userId))
        .limit(1);

      const user = results[0] as Record<string, unknown> | undefined;
      if (!user) {
        return null;
      }

      return {
        id: user[this.idColumn] as string | number,
        identity: user[this.identityColumn] as string,
        role: this.roleColumn
          ? (user[this.roleColumn] as string | undefined)
          : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Update user's password hash
   */
  async setPassword(
    userId: string | number,
    passwordHash: string,
  ): Promise<void> {
    const idCol = this.usersTable[this.idColumn];
    await this.db
      .update(this.usersTable)
      .set({ [this.passwordColumn]: passwordHash })
      .where(eq(idCol, userId));
  }

  /**
   * Get user's TOTP secret (to check if 2FA is enabled)
   */
  async getTotpSecret(userId: string | number): Promise<string | null> {
    if (!this.twoFactorEnabled || !this.totpSecretColumn) {
      return null;
    }

    try {
      const idCol = this.usersTable[this.idColumn];
      const results = await this.db
        .select({ totpSecret: this.usersTable[this.totpSecretColumn] })
        .from(this.usersTable)
        .where(eq(idCol, userId))
        .limit(1);

      const user = results[0] as { totpSecret?: string | null } | undefined;
      return user?.totpSecret ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Update user's TOTP secret
   * Pass null to disable 2FA
   */
  async setTotpSecret(
    userId: string | number,
    secret: string | null,
  ): Promise<void> {
    if (!this.twoFactorEnabled || !this.totpSecretColumn) {
      throw new Error(
        'Cannot set TOTP secret: 2FA is not enabled on this provider',
      );
    }

    const idCol = this.usersTable[this.idColumn];
    await this.db
      .update(this.usersTable)
      .set({ [this.totpSecretColumn]: secret })
      .where(eq(idCol, userId));
  }

  /**
   * Check if a user has 2FA enabled
   */
  async userHas2FA(userId: string | number): Promise<boolean> {
    const secret = await this.getTotpSecret(userId);
    return secret !== null;
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private async verifyTotpPhase(
    userId: string | number,
    code: string,
  ): Promise<AuthResult> {
    if (!this.totpSecretColumn) {
      return null;
    }

    try {
      const idCol = this.usersTable[this.idColumn];

      // Get user with TOTP secret and role
      const selectFields: Record<string, unknown> = {
        id: this.usersTable[this.idColumn],
        totpSecret: this.usersTable[this.totpSecretColumn],
        identity: this.usersTable[this.identityColumn],
      };

      if (this.roleColumn && this.usersTable[this.roleColumn]) {
        selectFields.role = this.usersTable[this.roleColumn];
      }

      const results = await this.db
        .select(selectFields)
        .from(this.usersTable)
        .where(eq(idCol, userId))
        .limit(1);

      const user = results[0] as {
        id: string | number;
        totpSecret?: string | null;
        role?: string;
        identity?: string;
      } | undefined;

      if (!user?.totpSecret) {
        return null;
      }

      // Verify TOTP code
      const valid = await verifyTOTP(code, user.totpSecret);

      if (!valid) {
        return null;
      }

      return {
        status: 'authenticated',
        user: {
          id: user.id,
          identity: user.identity ?? '',
          role: user.role,
        },
      };
    } catch {
      return null;
    }
  }
}
