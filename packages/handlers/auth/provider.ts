// Auth provider interface and implementations
// Providers authenticate credentials and return user info for JWT

import { eq } from 'drizzle-orm';
import { verifyPassword } from './password.ts';

/**
 * Authenticated user info (stored in JWT)
 */
export interface AuthUser {
  /** User identifier (stored in JWT 'sub' claim) */
  id: string | number;
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
}

/**
 * Password credentials (default)
 */
export interface PasswordCredentials {
  identity: string; // email, username, etc.
  password: string;
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
}

/**
 * Password-based authentication provider
 *
 * Authenticates against a Drizzle users table with email/password.
 *
 * Defaults (override if your schema uses different column names):
 * - `identityColumn`: 'email'
 * - `passwordColumn`: 'passwordHash'
 * - `idColumn`: 'id'
 * - `roleColumn`: 'role' (if column exists, otherwise undefined)
 *
 * @example
 * ```ts
 * // Minimal config (uses defaults)
 * const provider = new PasswordProvider({
 *   db,
 *   usersTable: schema.admins,
 * });
 *
 * // Custom column names
 * const provider = new PasswordProvider({
 *   db,
 *   usersTable: schema.users,
 *   identityColumn: 'username',
 *   passwordColumn: 'password_hash',
 *   roleColumn: 'user_role',
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

  constructor(options: PasswordProviderOptions) {
    this.db = options.db;
    this.usersTable = options.usersTable;
    this.identityColumn = options.identityColumn ?? 'email';
    this.passwordColumn = options.passwordColumn ?? 'passwordHash';
    this.idColumn = options.idColumn ?? 'id';
    this.roleColumn = options.roleColumn ?? 'role';

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
  }

  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { identity, password } = credentials as PasswordCredentials;

    if (!identity || !password) {
      return null;
    }

    try {
      // Query user by identity column
      const identityCol = this.usersTable[this.identityColumn];
      if (!identityCol) {
        throw new Error(
          `Identity column '${this.identityColumn}' not found on users table`,
        );
      }

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
      // Always run verifyPassword to prevent timing attacks from revealing
      // which accounts have passwords set vs those that don't
      const storedHash = user[this.passwordColumn] as string | undefined;
      const dummyHash =
        '$pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const valid = await verifyPassword(password, storedHash ?? dummyHash);
      if (!valid || !storedHash) {
        return null;
      }

      // Return authenticated result for JWT
      return {
        status: 'authenticated',
        user: {
          id: user[this.idColumn] as string | number,
          role: this.roleColumn
            ? (user[this.roleColumn] as string | undefined)
            : undefined,
        },
      };
    } catch {
      // Don't expose database errors
      return null;
    }
  }

  async parseCredentials(
    request: Request,
  ): Promise<PasswordCredentials | null> {
    try {
      const formData = await request.formData();
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
}
