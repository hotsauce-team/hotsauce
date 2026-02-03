# @hotsauce/auth

Authentication and authorization utilities for HotSauce CMS. Provides JWT tokens, password hashing, TOTP-based two-factor authentication, and account management.

## Installation

```ts
import {
  generateTOTPSecret,
  generateTOTPUri,
  hashPassword,
  PasswordProvider,
  verifyPassword,
} from '@hotsauce/auth';
```

## Overview

This package provides:

- **JWT tokens** - Sign and verify JSON Web Tokens using HMAC-SHA256
- **Password hashing** - PBKDF2-SHA256 with 600,000 iterations
- **TOTP utilities** - RFC 6238 compliant time-based one-time passwords
- **Challenge tokens** - Short-lived signed tokens for multi-step flows
- **PasswordProvider** - Complete authentication provider with optional 2FA
- **Account management** - Self-service password change and 2FA setup

## Modules

### JWT (`jwt.ts`)

| Export                                 | Purpose                        |
| -------------------------------------- | ------------------------------ |
| `signJwt(payload, secret)`             | Sign a JWT payload             |
| `verifyJwt(token, secret)`             | Verify and decode JWT          |
| `createJwtPayload(id, role?, maxAge?)` | Create JWT payload with expiry |
| `JwtPayload`                           | Type for JWT claims            |

```ts
import { createJwtPayload, signJwt, verifyJwt } from '@hotsauce/auth';

// Create a payload (8-hour default expiry)
const payload = createJwtPayload('user-123', 'admin');

// Sign it
const token = await signJwt(payload, process.env.JWT_SECRET!);

// Verify later
const decoded = await verifyJwt(token, process.env.JWT_SECRET!);
if (decoded) {
  console.log(decoded.sub); // 'user-123'
  console.log(decoded.role); // 'admin'
}
```

### Password Hashing (`password.ts`)

| Export                           | Purpose                      |
| -------------------------------- | ---------------------------- |
| `hashPassword(password)`         | Hash a password              |
| `verifyPassword(password, hash)` | Verify password against hash |

Hash format: `$pbkdf2-sha256$iterations$base64salt$base64hash`

```ts
import { hashPassword, verifyPassword } from '@hotsauce/auth';

// Hash for storage
const hash = await hashPassword('user-password');
// → '$pbkdf2-sha256$600000$base64salt$base64hash'

// Verify on login
const valid = await verifyPassword('user-password', hash);
// → true
```

### TOTP (`totp.ts`)

RFC 6238 compliant Time-based One-Time Password utilities.

| Export                                     | Purpose                           |
| ------------------------------------------ | --------------------------------- |
| `generateTOTPSecret()`                     | Generate random base32 secret     |
| `generateTOTP(secret, time?)`              | Generate current 6-digit code     |
| `verifyTOTP(code, secret, window?)`        | Verify code (±30s default window) |
| `generateTOTPUri(secret, account, issuer)` | Generate otpauth:// URI           |

```ts
import {
  generateTOTP,
  generateTOTPSecret,
  generateTOTPUri,
  verifyTOTP,
} from '@hotsauce/auth';

// Generate secret for new user
const secret = generateTOTPSecret();
// → 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

// Generate URI for QR code
const uri = generateTOTPUri(secret, 'alice@example.com', 'My App');
// → 'otpauth://totp/My%20App:alice%40example.com?secret=...&issuer=My%20App'

// Verify code from authenticator app
const valid = await verifyTOTP('123456', secret);
// → true/false
```

### Challenge Tokens (`challenge.ts`)

Short-lived signed tokens for multi-step authentication flows (e.g., 2FA challenge).

| Export                                           | Purpose                   |
| ------------------------------------------------ | ------------------------- |
| `createChallengeToken(userId, secret, payload?)` | Create signed token       |
| `verifyChallengeToken(token, secret)`            | Verify and extract userId |

```ts
import { createChallengeToken, verifyChallengeToken } from '@hotsauce/auth';

// After password verification, create challenge
const token = await createChallengeToken(userId, secret, { totpSecret });

// Later, verify challenge
const verified = await verifyChallengeToken(token, secret);
if (verified === userId) {
  // Challenge valid, proceed with 2FA verification
}
```

Tokens expire after 5 minutes by default.

### Cookies (`cookies.ts`)

Cookie utilities for JWT-based authentication.

| Export                                   | Purpose                           |
| ---------------------------------------- | --------------------------------- |
| `getTokenFromCookies(request, name)`     | Extract JWT from Cookie           |
| `createAuthCookie(name, token, options)` | Create Set-Cookie header          |
| `createClearCookie(name, path, secure)`  | Create Set-Cookie to clear cookie |
| `isSecureRequest(request)`               | Check if request is HTTPS*        |

\* `isSecureRequest` checks both `X-Forwarded-Proto` header (for TLS-terminating proxies) and the URL protocol.

### Login Page (`login.ts`)

Pre-built login page rendering and styles.

| Export              | Purpose                       |
| ------------------- | ----------------------------- |
| `renderLoginPage()` | Render HTML login form        |
| `loginStyles`       | CSS for login page            |
| `twoFactorStyles`   | CSS for 2FA verification form |

## PasswordProvider

The main authentication provider class. Supports password authentication with optional TOTP two-factor authentication.

### Basic Usage

```ts
import { PasswordProvider } from '@hotsauce/auth';
import { createCmsHandler } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    provider: new PasswordProvider({
      db,
      usersTable: users,
    }),
    policies: {},
  },
});
```

### With Two-Factor Authentication

```ts
const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    provider: new PasswordProvider({
      db,
      usersTable: users,
      issuer: 'My App', // Shown in authenticator apps
      // challengeSecret reads from CMS_2FA_SECRET env var if not provided
    }),
    policies: {},
  },
});
```

### Schema Requirements

Your users table must have at minimum these columns:

```ts
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  // Required columns
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),

  // Optional columns
  totpSecret: text('totp_secret'), // Only needed if using 2FA
  role: varchar('role', { length: 50 }), // Only needed if using role-based policies
});
```

### Constructor Options

| Option             | Default          | Description                                   |
| ------------------ | ---------------- | --------------------------------------------- |
| `db`               | (required)       | Drizzle database instance                     |
| `usersTable`       | (required)       | Drizzle table definition for users            |
| `identityColumn`   | `'email'`        | Column for login identity (email/username)    |
| `passwordColumn`   | `'passwordHash'` | Column storing password hash                  |
| `roleColumn`       | `'role'`         | Column for user role (optional, for policies) |
| `totpSecretColumn` | `'totpSecret'`   | Column for TOTP secret (optional, for 2FA)    |
| `issuer`           | `'CMS'`          | App name shown in authenticator apps          |
| `challengeSecret`  | `CMS_2FA_SECRET` | Secret for 2FA challenge tokens (32+ chars)   |

### How Authentication Works

1. **Password only (no `totpSecret`):**
   - User enters email/password
   - Password verified → login complete

2. **With 2FA (`totpSecret` is set):**
   - User enters email/password
   - Password verified → 2FA challenge form shown
   - User enters 6-digit TOTP code
   - TOTP verified → login complete

The 2FA challenge includes a signed token (5-minute expiry) to prevent unlimited TOTP guessing.

## Account Management

The PasswordProvider includes methods for self-service account management. These are automatically integrated into the CMS when using `@hotsauce/cms`.

### Account Routes

When auth is configured with PasswordProvider, these routes are added:

| URL                          | Method | Description           |
| ---------------------------- | ------ | --------------------- |
| `/admin/account`             | GET    | Account overview page |
| `/admin/account/password`    | GET    | Password change form  |
| `/admin/account/password`    | POST   | Change password       |
| `/admin/account/2fa`         | GET    | 2FA management page   |
| `/admin/account/2fa/enable`  | GET    | 2FA setup form (QR)   |
| `/admin/account/2fa/enable`  | POST   | Verify & enable 2FA   |
| `/admin/account/2fa/disable` | POST   | Disable 2FA           |

### Provider Methods

```ts
interface PasswordProvider {
  // Get user by ID
  getUser(userId: string | number): Promise<AuthUser | null>;

  // Check if user has 2FA enabled
  userHas2FA(userId: string | number): Promise<boolean>;

  // Change password
  setPassword(userId: string | number, newPassword: string): Promise<void>;

  // Get user's TOTP secret
  getTotpSecret(userId: string | number): Promise<string | null>;

  // Enable/disable 2FA
  setTotpSecret(userId: string | number, secret: string | null): Promise<void>;
}
```

### 2FA Setup Flow (Stateless)

The 2FA setup uses a stateless flow with signed tokens:

1. **User visits `/account/2fa/enable`:**
   - New TOTP secret is generated
   - Secret is embedded in a signed challenge token (5-min expiry)
   - QR code is displayed

2. **User scans QR and enters code:**
   - Token is verified (signature + expiry)
   - TOTP code is verified against embedded secret
   - Secret is saved to database
   - 2FA is now enabled

This approach requires no server-side session storage.

## Security

### PBKDF2-SHA256

- **600,000 iterations** - Exceeds OWASP 2023 recommendation
- **16-byte random salt** - Prevents rainbow table attacks
- **32-byte derived key** - 256-bit security
- **Constant-time comparison** - Prevents timing attacks

### TOTP

- **30-second periods** - Standard RFC 6238 timing
- **±1 period window** - Allows clock drift (configurable)
- **SHA-1 HMAC** - Compatible with all authenticator apps
- **Base32 secrets** - 160 bits of entropy

### Challenge Tokens

- **HMAC-SHA256 signature** - Tamper-proof
- **5-minute expiry** - Limits attack window
- **User ID binding** - Prevents token reuse for other users

### JWT

- **HMAC-SHA256** - Industry standard signing
- **8-hour default expiry** - Configurable
- **HttpOnly cookies** - XSS protection
- **SameSite=Lax** - CSRF protection

## Environment Variables

| Variable          | Purpose                                 |
| ----------------- | --------------------------------------- |
| `CMS_2FA_SECRET`  | 2FA challenge token signing (32+ chars) |
| `CMS_CSRF_SECRET` | CSRF token signing (32+ chars)          |
| `CMS_JWT_SECRET`  | JWT signing for auth (32+ chars)        |

Generate secrets with:

```bash
openssl rand -base64 32
```

## Types

```ts
// User returned from authentication
interface AuthUser {
  id: string | number;
  role?: string;
}

// Authentication result
type AuthResult =
  | null // Auth failed
  | { status: 'authenticated'; user: AuthUser } // Success
  | { status: '2fa_required'; challengeToken: string; user: AuthUser }; // Need 2FA

// JWT payload
interface JwtPayload {
  sub: string; // User ID
  role?: string; // User role
  iat: number; // Issued at
  exp: number; // Expiration
}

// Credentials for PasswordProvider
interface PasswordCredentials {
  identity: string; // Email/username
  password: string;
}

interface TwoFactorCredentials {
  challengeToken: string;
  totpCode: string;
}
```

## Integration with Handlers

The `@hotsauce/cms` package re-exports everything from `@hotsauce/auth` for convenience:

```ts
// These are equivalent:
import { PasswordProvider } from '@hotsauce/auth';
import { PasswordProvider } from '@hotsauce/cms';
```

When using `createCmsHandler`, the auth integration is automatic:

```ts
import { createCmsHandler, PasswordProvider } from '@hotsauce/cms';

const handler = createCmsHandler({
  db,
  schema,
  basePath: '/admin',
  auth: {
    provider: new PasswordProvider({
      db,
      usersTable: users,
      issuer: 'My App',
    }),
    policies: {},
  },
});

// Automatically adds these routes:
// - /admin/login (GET/POST)
// - /admin/logout (POST)
// - /admin/account (GET)
// - /admin/account/password (GET/POST)
// - /admin/account/2fa (GET)
// - /admin/account/2fa/enable (GET/POST)
// - /admin/account/2fa/disable (POST)
```
