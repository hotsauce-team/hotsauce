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
   * Authenticate credentials and return user info
   * @param credentials - Provider-specific credentials
   * @returns User info if valid, null if invalid
   */
  authenticate(credentials: unknown): Promise<AuthUser | null>;

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
  identityField?: string;

  /** Column name for password hash. Default: 'passwordHash' */
  passwordField?: string;

  /** Column name for user role (optional) */
  roleField?: string;

  /** Column name for primary key. Default: 'id' */
  idField?: string;
}

/**
 * Password-based authentication provider
 *
 * Authenticates against a Drizzle users table with email/password.
 *
 * Defaults (override if your schema uses different column names):
 * - `identityField`: 'email'
 * - `passwordField`: 'passwordHash'
 * - `idField`: 'id'
 * - `roleField`: 'role' (if column exists, otherwise undefined)
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
 *   identityField: 'username',
 *   passwordField: 'password_hash',
 *   roleField: 'user_role',
 * });
 * ```
 */
export class PasswordProvider implements AuthProvider {
  // deno-lint-ignore no-explicit-any
  private db: any;
  // deno-lint-ignore no-explicit-any
  private usersTable: any;
  private identityField: string;
  private passwordField: string;
  private roleField?: string;
  private idField: string;

  constructor(options: PasswordProviderOptions) {
    this.db = options.db;
    this.usersTable = options.usersTable;
    this.identityField = options.identityField ?? 'email';
    this.passwordField = options.passwordField ?? 'passwordHash';
    this.idField = options.idField ?? 'id';
    this.roleField = options.roleField ?? 'role';

    // Validate that required fields exist on the table
    if (!this.usersTable[this.identityField]) {
      throw new Error(
        `PasswordProvider: identity field '${this.identityField}' not found on users table`,
      );
    }
    if (!this.usersTable[this.passwordField]) {
      throw new Error(
        `PasswordProvider: password field '${this.passwordField}' not found on users table`,
      );
    }
    if (!this.usersTable[this.idField]) {
      throw new Error(
        `PasswordProvider: id field '${this.idField}' not found on users table`,
      );
    }
  }

  async authenticate(credentials: unknown): Promise<AuthUser | null> {
    const { identity, password } = credentials as PasswordCredentials;

    if (!identity || !password) {
      return null;
    }

    try {
      // Query user by identity field
      const identityColumn = this.usersTable[this.identityField];
      if (!identityColumn) {
        throw new Error(
          `Identity field '${this.identityField}' not found on users table`,
        );
      }

      const results = await this.db
        .select()
        .from(this.usersTable)
        .where(eq(identityColumn, identity))
        .limit(1);

      const user = results[0] as Record<string, unknown> | undefined;
      if (!user) {
        return null;
      }

      // Verify password
      // Always run verifyPassword to prevent timing attacks from revealing
      // which accounts have passwords set vs those that don't
      const storedHash = user[this.passwordField] as string | undefined;
      const dummyHash =
        '$pbkdf2-sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const valid = await verifyPassword(password, storedHash ?? dummyHash);
      if (!valid || !storedHash) {
        return null;
      }

      // Return user info for JWT
      return {
        id: user[this.idField] as string | number,
        role: this.roleField
          ? (user[this.roleField] as string | undefined)
          : undefined,
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
