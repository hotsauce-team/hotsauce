// Two-Factor Authentication Provider
// Extends password authentication with TOTP verification

import { eq } from 'drizzle-orm';
import { attrs, html, raw } from '@drizzle-cms/ui';
import { layout } from '@drizzle-cms/ui';
import {
  type AuthProvider,
  type AuthResult,
  type PasswordCredentials,
  PasswordProvider,
  type PasswordProviderOptions,
} from './provider.ts';
import { verifyTOTP } from './totp.ts';
import { createChallengeToken, verifyChallengeToken } from './challenge.ts';
import { getEnv } from '../runtime-compat.ts';

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
 * Options for TwoFactorPasswordProvider
 */
export interface TwoFactorPasswordProviderOptions
  extends PasswordProviderOptions {
  /** Column name for TOTP secret. Default: 'totpSecret' */
  totpSecretColumn?: string;

  /** Application name shown in authenticator apps */
  issuer?: string;

  /**
   * Secret for signing challenge tokens (32+ chars).
   * If not provided, falls back to CMS_2FA_SECRET environment variable.
   * Prevents unlimited TOTP guessing attacks.
   */
  challengeSecret?: string;
}

/**
 * Password + TOTP two-factor authentication provider
 *
 * Two-phase authentication flow:
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
 * // Minimal config - uses CMS_2FA_SECRET from environment
 * const provider = new TwoFactorPasswordProvider({
 *   db,
 *   usersTable: schema.admins,
 * });
 *
 * // Explicit secret (overrides environment variable)
 * const provider = new TwoFactorPasswordProvider({
 *   db,
 *   usersTable: schema.admins,
 *   totpSecretColumn: 'two_factor_secret',
 *   issuer: 'My CMS',
 *   challengeSecret: 'my-explicit-secret-at-least-32-chars',
 * });
 * ```
 */
export class TwoFactorPasswordProvider implements AuthProvider {
  private passwordProvider: PasswordProvider;
  // deno-lint-ignore no-explicit-any
  private db: any;
  // deno-lint-ignore no-explicit-any
  private usersTable: any;
  private idColumn: string;
  private totpSecretColumn: string;
  private challengeSecret: string;
  /** Application name for authenticator apps (used in setup flow) */
  readonly issuer: string;

  constructor(options: TwoFactorPasswordProviderOptions) {
    // Resolve challenge secret: option > env var
    const challengeSecret = options.challengeSecret ??
      getEnv('CMS_2FA_SECRET');

    if (!challengeSecret || challengeSecret.length < 32) {
      throw new Error(
        'TwoFactorPasswordProvider: challengeSecret must be at least 32 characters. ' +
          'Either pass challengeSecret option or set CMS_2FA_SECRET environment variable.',
      );
    }

    // Delegate password checking to PasswordProvider
    this.passwordProvider = new PasswordProvider(options);

    this.db = options.db;
    this.usersTable = options.usersTable;
    this.idColumn = options.idColumn ?? 'id';
    this.totpSecretColumn = options.totpSecretColumn ?? 'totpSecret';
    this.issuer = options.issuer ?? 'CMS';
    this.challengeSecret = challengeSecret;

    // Note: totpSecretColumn is optional - users without it skip 2FA
  }

  async authenticate(credentials: unknown): Promise<AuthResult> {
    const creds = credentials as TwoFactorCredentials;

    // Phase 2: TOTP verification with signed challenge
    if (creds.totpCode && creds.challengeToken) {
      // Verify the challenge token and extract user ID
      const userId = await verifyChallengeToken(
        creds.challengeToken,
        this.challengeSecret,
      );

      if (!userId) {
        // Invalid or expired challenge token
        return null;
      }

      return this.verifyTotpPhase(userId, creds.totpCode);
    }

    // Phase 1: Password verification
    const { identity, password } = creds;
    if (!identity || !password) {
      return null;
    }

    // Verify password using PasswordProvider
    const passwordResult = await this.passwordProvider.authenticate({
      identity,
      password,
    });

    if (!passwordResult || passwordResult.status !== 'authenticated') {
      return null;
    }

    const user = passwordResult.user;

    // Check if user has 2FA enabled
    const totpSecret = await this.getUserTotpSecret(user.id);

    if (totpSecret) {
      // Create signed challenge token for phase 2
      const challenge = await createChallengeToken(
        user.id,
        this.challengeSecret,
      );

      // Return pending state with challenge
      return {
        status: 'pending_2fa',
        userId: user.id,
        challenge,
      };
    }

    // No 2FA configured - return full auth
    return passwordResult;
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
          identity: '', // Not needed for phase 2
          password: '', // Not needed for phase 2
          totpCode: totpCode.replace(/\s/g, ''), // Strip spaces
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
    // Default password form - TOTP form is rendered separately
    // This is called for initial login page
    return ''; // Use default form from login.ts
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

  /**
   * Check if a user has 2FA enabled
   */
  async userHas2FA(userId: string | number): Promise<boolean> {
    const secret = await this.getUserTotpSecret(userId);
    return secret !== null;
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private async getUserTotpSecret(
    userId: string | number,
  ): Promise<string | null> {
    try {
      // Check if the column exists on the table
      if (!this.usersTable[this.totpSecretColumn]) {
        return null;
      }

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

  private async verifyTotpPhase(
    userId: string | number,
    code: string,
  ): Promise<AuthResult> {
    try {
      const idCol = this.usersTable[this.idColumn];

      // Get user with TOTP secret and role
      const selectFields: Record<string, unknown> = {
        id: this.usersTable[this.idColumn],
        totpSecret: this.usersTable[this.totpSecretColumn],
      };

      // Add role if column exists
      if (this.usersTable.role) {
        selectFields.role = this.usersTable.role;
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
      } | undefined;

      if (!user?.totpSecret) {
        return null;
      }

      // Verify TOTP code
      const valid = await verifyTOTP(code, user.totpSecret);

      if (!valid) {
        // TODO: Check backup codes if TOTP fails (see README for planned feature)
        return null;
      }

      return {
        status: 'authenticated',
        user: {
          id: user.id,
          role: user.role,
        },
      };
    } catch {
      return null;
    }
  }
}

/**
 * Additional CSS for TOTP input
 */
export const twoFactorStyles = `
/* TOTP-specific styles */
.cms-input-totp {
  font-family: monospace;
  font-size: 1.5rem;
  letter-spacing: 0.5em;
  text-align: center;
}

.cms-login-subtitle {
  color: var(--cms-text-secondary, #6b7280);
  margin-bottom: 1.5rem;
  text-align: center;
}

.cms-login-footer {
  margin-top: 1.5rem;
  text-align: center;
}

.cms-login-footer .cms-link {
  color: var(--cms-text-secondary, #6b7280);
  text-decoration: none;
}

.cms-login-footer .cms-link:hover {
  color: var(--cms-primary, #2563eb);
}
`;
