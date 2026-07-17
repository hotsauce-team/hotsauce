// Account route handlers
// Handles account settings, password change, and 2FA setup/disable

import type { PasswordProvider } from '../provider.ts';
import { hashPassword } from '../password.ts';
import { generateTOTPSecret, generateTOTPUri, verifyTOTP } from '../totp.ts';
import {
  createChallengeToken,
  decryptTokenData,
  encryptTokenData,
  verifyChallengeToken,
} from '../challenge.ts';
import type { JwtPayload } from '../types.ts';
import {
  render2FADisablePage,
  render2FASetupPage,
  renderAccountPage,
  renderPasswordChangePage,
} from './views.ts';

// ─────────────────────────────────────────────────────────────
// QR Code Generation (optional peer dependency)
// ─────────────────────────────────────────────────────────────

interface QRCode {
  addData(data: string): void;
  make(): void;
  createDataURL(cellSize?: number): string;
}

interface QRCodeFactory {
  (typeNumber: number, errorCorrectionLevel: string): QRCode;
}

/**
 * Lazily load qrcode-generator (optional peer dependency).
 * Only needed when user visits 2FA setup page.
 */
async function loadQRCodeGenerator(): Promise<QRCodeFactory> {
  try {
    // Dynamic import - only loaded when 2FA setup is accessed
    const mod = await import('qrcode-generator');
    return mod.default as QRCodeFactory;
  } catch {
    throw new Error(
      '2FA setup requires the qrcode-generator package.\n\n' +
        'Install with a pinned version you have audited:\n' +
        '  npm install qrcode-generator@2.0.4\n' +
        '  # or: deno add npm:qrcode-generator@2.0.4\n\n' +
        'Note: This is an npm dependency and a potential supply chain attack vector.\n' +
        'Pin to a specific version and audit before use in production.',
    );
  }
}

/**
 * Generate a QR code data URL for a TOTP URI.
 * @throws {Error} if qrcode-generator is not installed
 */
async function generateQRDataUrl(uri: string): Promise<string> {
  const qrcode = await loadQRCodeGenerator();
  const qr = qrcode(0, 'M');
  qr.addData(uri);
  qr.make();
  return qr.createDataURL(4);
}

/** Security headers for all responses */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
  // Account pages are per-user and the 2FA setup page renders the TOTP
  // secret — nothing here may be stored by any cache.
  'Cache-Control': 'no-store',
};

/**
 * Context passed to account route handlers
 */
export interface AccountRouteContext {
  /** Base path for the CMS (e.g., '/admin') */
  basePath: string;
  /** CMS title */
  title: string;
  /** Authenticated user's JWT payload */
  jwtPayload: JwtPayload;
  /** Auth provider instance */
  provider: PasswordProvider;
  /** CSRF secret for token generation/validation */
  csrfSecret: string;
  /**
   * Secret for signing 2FA setup tokens.
   * Undefined when 2FA is disabled (provider.twoFactorEnabled is false).
   * Guaranteed ≥32 chars when defined (provider constructor validates).
   */
  challengeSecret: string | undefined;
  /** Function to generate CSRF token */
  generateCsrfToken: (secret: string) => Promise<string>;
  /** Function to validate CSRF token */
  validateCsrfToken: (token: string | null, secret: string) => Promise<boolean>;
}

/**
 * Narrowed context type when 2FA is enabled.
 * Use `has2FAEnabled()` type guard to narrow from `AccountRouteContext`.
 */
export type AccountRouteContextWith2FA = AccountRouteContext & {
  challengeSecret: string;
};

/**
 * Type guard to check if 2FA is enabled in the context.
 * When true, narrows `challengeSecret` from `string | undefined` to `string`.
 *
 * @example
 * ```ts
 * if (!has2FAEnabled(ctx)) {
 *   return redirect(`${basePath}/account`);
 * }
 * // ctx.challengeSecret is now typed as string
 * const token = await createChallengeToken(data, ctx.challengeSecret);
 * ```
 */
export function has2FAEnabled(
  ctx: AccountRouteContext,
): ctx is AccountRouteContextWith2FA {
  return ctx.provider.twoFactorEnabled && ctx.challengeSecret !== undefined;
}

/**
 * Handle GET /account - Account settings page
 */
export async function handleAccountPage(
  _request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const {
    basePath,
    title,
    jwtPayload,
    provider,
    csrfSecret,
    generateCsrfToken,
  } = ctx;

  const user = await provider.getUser(jwtPayload.sub);
  if (!user) {
    return redirectToLogin(basePath);
  }

  const has2FA = await provider.userHas2FA(jwtPayload.sub);
  const csrfToken = await generateCsrfToken(csrfSecret);

  const html = renderAccountPage({
    basePath,
    title,
    user,
    has2FA,
    twoFactorEnabled: provider.twoFactorEnabled,
    csrfToken,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Handle GET /account/password - Change password form
 */
export async function handlePasswordChangeForm(
  _request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const { basePath, title, csrfSecret, generateCsrfToken } = ctx;

  const csrfToken = await generateCsrfToken(csrfSecret);

  const html = renderPasswordChangePage({
    basePath,
    title,
    csrfToken,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Handle POST /account/password - Process password change
 */
export async function handlePasswordChange(
  request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const {
    basePath,
    title,
    jwtPayload,
    provider,
    csrfSecret,
    generateCsrfToken,
    validateCsrfToken,
  } = ctx;

  const formData = await request.formData();

  // Validate CSRF
  const csrfToken = formData.get('__cms_csrf') as string | null;
  if (!await validateCsrfToken(csrfToken, csrfSecret)) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      renderPasswordChangePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'Your session has expired. Please try again.',
      }),
      403,
    );
  }

  const currentPassword = formData.get('current_password') as string | null;
  const newPassword = formData.get('new_password') as string | null;
  const confirmPassword = formData.get('confirm_password') as string | null;

  // Validate fields
  if (!currentPassword || !newPassword || !confirmPassword) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      renderPasswordChangePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'All fields are required.',
      }),
      400,
    );
  }

  if (newPassword !== confirmPassword) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      renderPasswordChangePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'New passwords do not match.',
      }),
      400,
    );
  }

  if (newPassword.length < 8) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      renderPasswordChangePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'New password must be at least 8 characters.',
      }),
      400,
    );
  }

  // Verify current password
  const user = await provider.getUser(jwtPayload.sub);
  if (!user) {
    return redirectToLogin(basePath);
  }

  // We need to verify the current password - authenticate with the provider
  const authResult = await provider.authenticate({
    identity: user.identity ?? '',
    password: currentPassword,
  });

  // If auth returns null or pending_2fa, the current password is wrong
  // (pending_2fa means password was correct but we're just checking here)
  if (!authResult) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      renderPasswordChangePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'Current password is incorrect.',
      }),
      400,
    );
  }

  // Update password
  const newHash = await hashPassword(newPassword);
  await provider.setPassword(jwtPayload.sub, newHash);

  // Redirect to account page with success message
  return redirect(`${basePath}/account?success=password_changed`);
}

/**
 * Handle GET /account/2fa - 2FA setup page
 */
export async function handle2FASetupForm(
  _request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const { basePath } = ctx;

  // 2FA routes require 2FA to be enabled in provider
  // Type guard narrows challengeSecret to string
  if (!has2FAEnabled(ctx)) {
    return redirect(`${basePath}/account`);
  }

  const {
    title,
    jwtPayload,
    provider,
    csrfSecret,
    challengeSecret,
    generateCsrfToken,
  } = ctx;

  // Check if 2FA is already enabled
  const has2FA = await provider.userHas2FA(jwtPayload.sub);
  if (has2FA) {
    return redirect(`${basePath}/account`);
  }

  const user = await provider.getUser(jwtPayload.sub);
  if (!user) {
    return redirectToLogin(basePath);
  }

  // Generate new TOTP secret
  const secret = generateTOTPSecret();
  const uri = generateTOTPUri(
    secret,
    user.identity ?? jwtPayload.sub,
    provider.issuer,
  );

  // Generate QR code (may throw if qrcode-generator not installed)
  const qrDataUrl = await generateQRDataUrl(uri);

  // Create setup token with encrypted secret (prevents leaking secret if token is logged)
  // Token binds userId for validation, encrypted payload contains the actual secret
  const encryptedSecret = await encryptTokenData(secret, challengeSecret);
  const setupToken = await createChallengeToken(
    `${jwtPayload.sub}:${encryptedSecret}`,
    challengeSecret,
  );

  const csrfToken = await generateCsrfToken(csrfSecret);

  const html = render2FASetupPage({
    basePath,
    title,
    csrfToken,
    qrDataUrl,
    secret,
    setupToken,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}

/**
 * Handle POST /account/2fa/enable - Verify and enable 2FA
 */
export async function handle2FAEnable(
  request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const { basePath } = ctx;

  // 2FA routes require 2FA to be enabled in provider
  // Type guard narrows challengeSecret to string
  if (!has2FAEnabled(ctx)) {
    return redirect(`${basePath}/account`);
  }

  const {
    title,
    jwtPayload,
    provider,
    csrfSecret,
    challengeSecret,
    generateCsrfToken,
    validateCsrfToken,
  } = ctx;

  const formData = await request.formData();

  // Validate CSRF
  const csrfToken = formData.get('__cms_csrf') as string | null;
  if (!await validateCsrfToken(csrfToken, csrfSecret)) {
    return redirect(`${basePath}/account/2fa?error=session_expired`);
  }

  const totpCode = (formData.get('totp_code') as string | null)?.replace(
    /\s/g,
    '',
  );
  const setupToken = formData.get('setup_token') as string | null;

  if (!totpCode || !setupToken) {
    return redirect(`${basePath}/account/2fa?error=missing_fields`);
  }

  // Verify setup token and extract encrypted secret
  const tokenData = await verifyChallengeToken(setupToken, challengeSecret);
  if (!tokenData || typeof tokenData !== 'string') {
    return redirect(`${basePath}/account/2fa?error=token_expired`);
  }

  // Parse userId:encryptedSecret from token
  const colonIndex = String(tokenData).indexOf(':');
  if (colonIndex === -1) {
    return redirect(`${basePath}/account/2fa?error=invalid_token`);
  }

  const tokenUserId = String(tokenData).slice(0, colonIndex);
  const encryptedSecret = String(tokenData).slice(colonIndex + 1);

  // Verify user ID matches
  if (tokenUserId !== String(jwtPayload.sub)) {
    return redirect(`${basePath}/account/2fa?error=invalid_user`);
  }

  // Decrypt the TOTP secret
  const secret = await decryptTokenData(encryptedSecret, challengeSecret);
  if (!secret) {
    return redirect(`${basePath}/account/2fa?error=invalid_token`);
  }

  // Verify TOTP code (with try/catch for malformed secrets)
  let valid = false;
  try {
    valid = await verifyTOTP(totpCode, secret);
  } catch {
    // Malformed secret - treat as invalid
    return redirect(`${basePath}/account/2fa?error=invalid_token`);
  }

  if (!valid) {
    // Re-render setup page with error
    const user = await provider.getUser(jwtPayload.sub);
    if (!user) {
      return redirectToLogin(basePath);
    }

    const uri = generateTOTPUri(
      secret,
      user.identity ?? jwtPayload.sub,
      provider.issuer,
    );
    const qrDataUrl = await generateQRDataUrl(uri);

    // Re-encrypt for the new setup token
    const newEncryptedSecret = await encryptTokenData(secret, challengeSecret);
    const newSetupToken = await createChallengeToken(
      `${jwtPayload.sub}:${newEncryptedSecret}`,
      challengeSecret,
    );
    const newCsrfToken = await generateCsrfToken(csrfSecret);

    return htmlResponse(
      render2FASetupPage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        qrDataUrl,
        secret,
        setupToken: newSetupToken,
        error: 'Invalid verification code. Please try again.',
      }),
      400,
    );
  }

  // Enable 2FA
  await provider.setTotpSecret(jwtPayload.sub, secret);

  return redirect(`${basePath}/account?success=2fa_enabled`);
}

/**
 * Handle POST /account/2fa/disable - Disable 2FA
 * Requires both password AND OTP verification for security
 */
export async function handle2FADisable(
  request: Request,
  ctx: AccountRouteContext,
): Promise<Response> {
  const {
    basePath,
    title,
    jwtPayload,
    provider,
    csrfSecret,
    generateCsrfToken,
    validateCsrfToken,
  } = ctx;

  // 2FA routes require 2FA to be enabled in provider
  if (!provider.twoFactorEnabled) {
    return redirect(`${basePath}/account`);
  }

  const formData = await request.formData();

  // Validate CSRF
  const csrfToken = formData.get('__cms_csrf') as string | null;
  if (!await validateCsrfToken(csrfToken, csrfSecret)) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      render2FADisablePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'Your session has expired. Please try again.',
      }),
      403,
    );
  }

  // Check if password and OTP are provided
  const password = formData.get('password') as string | null;
  const totpCode = formData.get('totp_code') as string | null;

  if (!password || !totpCode) {
    // Show confirmation page (shouldn't happen with required fields, but handle gracefully)
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      render2FADisablePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: !password
          ? 'Password is required.'
          : 'Authentication code is required.',
      }),
      400,
    );
  }

  // Get user
  const user = await provider.getUser(jwtPayload.sub);
  if (!user) {
    return redirectToLogin(basePath);
  }

  // Verify password
  const authResult = await provider.authenticate({
    identity: user.identity ?? '',
    password,
  });

  // For password verification, we accept both authenticated and pending_2fa
  // (pending_2fa means password was correct but user has 2FA enabled)
  if (!authResult) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      render2FADisablePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'Incorrect password.',
      }),
      400,
    );
  }

  // Verify OTP
  const totpSecret = await provider.getTotpSecret(jwtPayload.sub);
  if (!totpSecret) {
    // User doesn't have 2FA enabled - redirect back
    return redirect(`${basePath}/account`);
  }

  // Normalize OTP (remove spaces) and verify (with try/catch for malformed secrets)
  const normalizedCode = totpCode.replace(/\s/g, '');
  let isValidOtp = false;
  try {
    isValidOtp = await verifyTOTP(normalizedCode, totpSecret);
  } catch {
    // Malformed secret in DB - log error and treat as invalid code
    // This shouldn't happen with valid data, but protects against corruption
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      render2FADisablePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error:
          'Unable to verify code. Please contact support if this persists.',
      }),
      500,
    );
  }

  if (!isValidOtp) {
    const newCsrfToken = await generateCsrfToken(csrfSecret);
    return htmlResponse(
      render2FADisablePage({
        basePath,
        title,
        csrfToken: newCsrfToken,
        error: 'Incorrect authentication code. Please try again.',
      }),
      400,
    );
  }

  // Both password and OTP verified - disable 2FA
  await provider.setTotpSecret(jwtPayload.sub, null);

  return redirect(`${basePath}/account?success=2fa_disabled`);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  });
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': location,
      ...SECURITY_HEADERS,
    },
  });
}

function redirectToLogin(basePath: string): Response {
  return redirect(`${basePath}/login`);
}
