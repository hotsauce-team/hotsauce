// Account page views - HTML templates for account management
// Uses the same styling as the rest of the CMS

import { attrs, html, raw } from '@hotsauce/ui';
import { layout } from '@hotsauce/ui';
import type { AuthUser } from '../types.ts';

/**
 * Render the main account settings page
 */
export function renderAccountPage(options: {
  basePath: string;
  title: string;
  user: AuthUser;
  has2FA: boolean;
  twoFactorEnabled: boolean;
  csrfToken: string;
  success?: string;
  error?: string;
}): string {
  const {
    basePath,
    title,
    user,
    has2FA,
    twoFactorEnabled,
    csrfToken,
    success,
    error,
  } = options;

  const content = html`
    <div class="cms-account-container">
      <h1 class="cms-page-title">Account Settings</h1>

      ${success
        ? raw(html`
          <div class="cms-alert cms-alert-success">${success}</div>
        `)
        : ''} ${error
        ? raw(html`
          <div class="cms-alert cms-alert-error">${error}</div>
        `)
        : ''}

      <div class="cms-account-section">
        <h2 class="cms-section-title">Profile</h2>
        <div class="cms-account-info">
          <div class="cms-account-row">
            <span class="cms-account-label">Email</span>
            <span class="cms-account-value">${user.identity ?? 'N/A'}</span>
          </div>
          ${user.role
            ? raw(html`
              <div class="cms-account-row">
                <span class="cms-account-label">Role</span>
                <span class="cms-account-value">${user.role}</span>
              </div>
            `)
            : ''}
        </div>
      </div>

      <div class="cms-account-section">
        <h2 class="cms-section-title">Password</h2>
        <p class="cms-section-desc">
          Change your password to keep your account secure.
        </p>
        <a href="${basePath}/account/password" class="cms-btn cms-btn-secondary">
          Change Password
        </a>
      </div>

      ${twoFactorEnabled
        ? raw(html`
          <div class="cms-account-section">
            <h2 class="cms-section-title">Two-Factor Authentication</h2>
            ${has2FA
              ? raw(html`
                <div class="cms-2fa-status cms-2fa-enabled">
                  <span class="cms-2fa-icon">✓</span>
                  <span>Two-factor authentication is <strong>enabled</strong></span>
                </div>
                <p class="cms-section-desc">
                  Your account is protected with TOTP-based two-factor authentication.
                </p>
                <form
                  method="POST"
                  action="${basePath}/account/2fa/disable"
                  class="cms-inline-form"
                >
                  <input type="hidden" name="_csrf" value="${csrfToken}" />
                  <button type="submit" class="cms-btn cms-btn-danger">
                    Disable 2FA
                  </button>
                </form>
              `)
              : raw(html`
                <div class="cms-2fa-status cms-2fa-disabled">
                  <span class="cms-2fa-icon">○</span>
                  <span>Two-factor authentication is <strong>not enabled</strong></span>
                </div>
                <p class="cms-section-desc">
                  Add an extra layer of security to your account by enabling two-factor
                  authentication.
                </p>
                <a href="${basePath}/account/2fa" class="cms-btn cms-btn-primary">
                  Enable 2FA
                </a>
              `)}
          </div>
        `)
        : ''}

      <div class="cms-account-section cms-account-logout">
        <form method="POST" action="${basePath}/logout">
          <input type="hidden" name="_csrf" value="${csrfToken}" />
          <button type="submit" class="cms-btn cms-btn-secondary">
            Sign Out
          </button>
        </form>
      </div>
    </div>
  `;

  return layout(content, {
    title: `Account - ${title}`,
    siteName: title,
    nav: [{ href: basePath, label: '← Back to CMS' }],
    stylesheetUrl: `${basePath}/styles.css`,
  });
}

/**
 * Render the change password page
 */
export function renderPasswordChangePage(options: {
  basePath: string;
  title: string;
  csrfToken: string;
  error?: string;
}): string {
  const { basePath, title, csrfToken, error } = options;

  const content = html`
    <div class="cms-account-container">
      <h1 class="cms-page-title">Change Password</h1>

      ${error
        ? raw(html`
          <div class="cms-alert cms-alert-error">${error}</div>
        `)
        : ''}

      <form
        method="POST"
        action="${basePath}/account/password"
        class="cms-account-form"
      >
        <input type="hidden" name="_csrf" value="${csrfToken}" />

        <div class="cms-form-field">
          <label for="current_password" class="cms-label">Current Password</label>
          <input
            ${attrs({
              type: 'password',
              id: 'current_password',
              name: 'current_password',
              required: true,
              autocomplete: 'current-password',
            })}
            class="cms-input"
          />
        </div>

        <div class="cms-form-field">
          <label for="new_password" class="cms-label">New Password</label>
          <input
            ${attrs({
              type: 'password',
              id: 'new_password',
              name: 'new_password',
              required: true,
              autocomplete: 'new-password',
              minlength: '8',
            })}
            class="cms-input"
          />
          <p class="cms-field-hint">At least 8 characters</p>
        </div>

        <div class="cms-form-field">
          <label for="confirm_password" class="cms-label"
          >Confirm New Password</label>
          <input
            ${attrs({
              type: 'password',
              id: 'confirm_password',
              name: 'confirm_password',
              required: true,
              autocomplete: 'new-password',
            })}
            class="cms-input"
          />
        </div>

        <div class="cms-form-actions">
          <button type="submit" class="cms-btn cms-btn-primary">
            Update Password
          </button>
          <a href="${basePath}/account" class="cms-btn cms-btn-secondary">
            Cancel
          </a>
        </div>
      </form>
    </div>
  `;

  return layout(content, {
    title: `Change Password - ${title}`,
    siteName: title,
    nav: [{ href: `${basePath}/account`, label: '← Back to Account' }],
    stylesheetUrl: `${basePath}/styles.css`,
  });
}

/**
 * Render the 2FA setup page with QR code
 */
export function render2FASetupPage(options: {
  basePath: string;
  title: string;
  csrfToken: string;
  qrDataUrl: string;
  secret: string;
  setupToken: string;
  error?: string;
}): string {
  const { basePath, title, csrfToken, qrDataUrl, secret, setupToken, error } =
    options;

  const content = html`
    <div class="cms-account-container">
      <h1 class="cms-page-title">Enable Two-Factor Authentication</h1>

      ${error
        ? raw(html`
          <div class="cms-alert cms-alert-error">${error}</div>
        `)
        : ''}

      <div class="cms-2fa-setup">
        <div class="cms-2fa-step">
          <span class="cms-step-number">1</span>
          <div class="cms-step-content">
            <h3>Scan QR Code</h3>
            <p>
              Scan this QR code with your authenticator app (Google Authenticator,
              Authy, 1Password, etc.)
            </p>
            <div class="cms-qr-container">
              <img src="${qrDataUrl}" alt="2FA QR Code" class="cms-qr-code" />
            </div>
          </div>
        </div>

        <div class="cms-2fa-step">
          <span class="cms-step-number">2</span>
          <div class="cms-step-content">
            <h3>Or Enter Code Manually</h3>
            <p>
              If you can't scan the QR code, enter this secret key in your
              authenticator app:
            </p>
            <code class="cms-secret-code">${secret}</code>
          </div>
        </div>

        <div class="cms-2fa-step">
          <span class="cms-step-number">3</span>
          <div class="cms-step-content">
            <h3>Verify Setup</h3>
            <p>
              Enter the 6-digit code from your authenticator app to confirm setup:
            </p>
            <form
              method="POST"
              action="${basePath}/account/2fa/enable"
              class="cms-2fa-verify-form"
            >
              <input type="hidden" name="_csrf" value="${csrfToken}" />
              <input type="hidden" name="setup_token" value="${setupToken}" />
              <div class="cms-form-field">
                <input
                  ${attrs({
                    type: 'text',
                    name: 'totp_code',
                    placeholder: '000000',
                    required: true,
                    autocomplete: 'one-time-code',
                    pattern: '[0-9]{6}',
                    maxlength: '6',
                    inputmode: 'numeric',
                  })}
                  class="cms-input cms-input-totp"
                />
              </div>
              <button type="submit" class="cms-btn cms-btn-primary">
                Enable 2FA
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="cms-form-actions">
        <a href="${basePath}/account" class="cms-btn cms-btn-secondary">
          Cancel
        </a>
      </div>
    </div>
  `;

  return layout(content, {
    title: `Enable 2FA - ${title}`,
    siteName: title,
    nav: [{ href: `${basePath}/account`, label: '← Back to Account' }],
    stylesheetUrl: `${basePath}/styles.css`,
  });
}

/**
 * Render 2FA disable confirmation page
 */
export function render2FADisablePage(options: {
  basePath: string;
  title: string;
  csrfToken: string;
  error?: string;
}): string {
  const { basePath, title, csrfToken, error } = options;

  const content = html`
    <div class="cms-account-container">
      <h1 class="cms-page-title">Disable Two-Factor Authentication</h1>

      ${error
        ? raw(html`
          <div class="cms-alert cms-alert-error">${error}</div>
        `)
        : ''}

      <div class="cms-warning-box">
        <p>
          <strong>Warning:</strong> Disabling two-factor authentication will make
          your account less secure.
        </p>
      </div>

      <form
        method="POST"
        action="${basePath}/account/2fa/disable"
        class="cms-account-form"
      >
        <input type="hidden" name="_csrf" value="${csrfToken}" />

        <div class="cms-form-field">
          <label for="password" class="cms-label">Password</label>
          <input
            ${attrs({
              type: 'password',
              id: 'password',
              name: 'password',
              required: true,
              autocomplete: 'current-password',
            })}
            class="cms-input"
          />
        </div>

        <div class="cms-form-field">
          <label for="totp_code" class="cms-label">Authentication Code</label>
          <input
            ${attrs({
              type: 'text',
              id: 'totp_code',
              name: 'totp_code',
              required: true,
              autocomplete: 'one-time-code',
              inputmode: 'numeric',
              pattern: '[0-9\\s]*',
              maxlength: '7',
              placeholder: '000 000',
            })}
            class="cms-input cms-input-otp"
          />
          <p class="cms-field-hint">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        <div class="cms-form-actions">
          <button type="submit" class="cms-btn cms-btn-danger">
            Disable 2FA
          </button>
          <a href="${basePath}/account" class="cms-btn cms-btn-secondary">
            Cancel
          </a>
        </div>
      </form>
    </div>
  `;

  return layout(content, {
    title: `Disable 2FA - ${title}`,
    siteName: title,
    nav: [{ href: `${basePath}/account`, label: '← Back to Account' }],
    stylesheetUrl: `${basePath}/styles.css`,
  });
}

/**
 * Additional CSS for account pages
 */
export const accountStyles = `
/* Account Pages */
.cms-account-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
}

.cms-page-title {
  margin: 0 0 2rem 0;
  font-size: 1.75rem;
  color: var(--cms-text);
}

.cms-section-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
  color: var(--cms-text);
}

.cms-section-desc {
  margin: 0 0 1rem 0;
  color: var(--cms-text-secondary, #6b7280);
}

.cms-account-section {
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--cms-border);
}

.cms-account-section:last-child {
  border-bottom: none;
}

.cms-account-info {
  background: var(--cms-bg-secondary, #f9fafb);
  border-radius: 8px;
  padding: 1rem;
}

.cms-account-row {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
}

.cms-account-row + .cms-account-row {
  border-top: 1px solid var(--cms-border);
}

.cms-account-label {
  color: var(--cms-text-secondary, #6b7280);
}

.cms-account-value {
  font-weight: 500;
  color: var(--cms-text);
}

.cms-account-form {
  max-width: 400px;
}

.cms-form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.cms-field-hint {
  margin: 0.25rem 0 0 0;
  font-size: 0.875rem;
  color: var(--cms-text-secondary, #6b7280);
}

.cms-inline-form {
  display: inline;
}

/* 2FA Status */
.cms-2fa-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.cms-2fa-enabled {
  background: #dcfce7;
  color: #16a34a;
}

.cms-2fa-disabled {
  background: #fef3c7;
  color: #d97706;
}

.cms-2fa-icon {
  font-size: 1.25rem;
  font-weight: bold;
}

/* 2FA Setup */
.cms-2fa-setup {
  margin: 2rem 0;
}

.cms-2fa-step {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.cms-step-number {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cms-primary, #2563eb);
  color: white;
  border-radius: 50%;
  font-weight: bold;
}

.cms-step-content h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.cms-step-content p {
  margin: 0 0 1rem 0;
  color: var(--cms-text-secondary, #6b7280);
}

.cms-qr-container {
  display: inline-block;
  padding: 1rem;
  background: white;
  border: 1px solid var(--cms-border);
  border-radius: 8px;
}

.cms-qr-code {
  display: block;
  width: 200px;
  height: 200px;
}

.cms-secret-code {
  display: block;
  padding: 0.75rem 1rem;
  background: var(--cms-bg-secondary, #f9fafb);
  border: 1px solid var(--cms-border);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.875rem;
  word-break: break-all;
  user-select: all;
}

.cms-2fa-verify-form {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
}

.cms-2fa-verify-form .cms-form-field {
  margin: 0;
}

/* Warning Box */
.cms-warning-box {
  padding: 1rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  color: #92400e;
  margin-bottom: 1.5rem;
}

.cms-warning-box p {
  margin: 0;
}

/* Button variants */
.cms-btn-danger {
  background: #dc2626;
  color: white;
  border: none;
}

.cms-btn-danger:hover {
  background: #b91c1c;
}

.cms-account-logout {
  padding-top: 2rem;
}
`;
