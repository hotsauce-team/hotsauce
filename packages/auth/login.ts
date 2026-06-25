// Login/logout UI templates
// Uses the same styling as the rest of the CMS

import { attrs, html, raw } from '@hotsauce/ui';
import { layout } from '@hotsauce/ui';

/**
 * Render the login page
 */
export function renderLoginPage(options: {
  basePath: string;
  title: string;
  error?: string;
  identityLabel?: string;
  identityPlaceholder?: string;
  identityValue?: string;
  csrfToken: string;
}): string {
  const {
    basePath,
    title,
    error,
    identityLabel = 'Email',
    identityPlaceholder = 'admin@example.com',
    identityValue = '',
    csrfToken,
  } = options;

  const formContent = html`
    <div class="cms-login-container">
      <div class="cms-login-box">
        <h1 class="cms-login-title">${title}</h1>

        ${error
          ? raw(html`
            <div class="cms-alert cms-alert-error">
              ${error}
            </div>
          `)
          : ''}

        <form method="POST" action="${basePath}/login" class="cms-login-form">
          <input type="hidden" name="__cms_csrf" value="${csrfToken}" />

          <div class="cms-form-field">
            <label for="identity" class="cms-label">${identityLabel}</label>
            <input
              ${attrs({
                type: 'text',
                id: 'identity',
                name: 'identity',
                value: identityValue,
                placeholder: identityPlaceholder,
                required: true,
                autocomplete: 'username',
                autofocus: true,
              })}
              class="cms-input"
            />
          </div>

          <div class="cms-form-field">
            <label for="password" class="cms-label">Password</label>
            <input
              ${attrs({
                type: 'password',
                id: 'password',
                name: 'password',
                placeholder: '••••••••',
                required: true,
                autocomplete: 'current-password',
              })}
              class="cms-input"
            />
          </div>

          <button type="submit" class="cms-btn cms-btn-primary cms-login-btn">
            Sign In
          </button>
        </form>
      </div>
    </div>
  `;

  // Use layout without nav for login page
  return layout(formContent, {
    title: `Login - ${title}`,
    siteName: title,
    nav: [],
    stylesheetUrl: `${basePath}/styles.css`,
  });
}

/**
 * Additional CSS for login page
 * This is appended to the main stylesheet
 */
export const loginStyles: string = `
/* Login Page Styles */
.cms-login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
  padding: 2rem;
}

.cms-login-box {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  background: var(--cms-bg);
  border: 1px solid var(--cms-border);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.cms-login-title {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  text-align: center;
  color: var(--cms-text);
}

.cms-login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.cms-login-btn {
  margin-top: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 1rem;
}

.cms-alert {
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.cms-alert-error {
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #dc2626;
}

.cms-alert-success {
  background: #dcfce7;
  border: 1px solid #bbf7d0;
  color: #16a34a;
}
`;

/**
 * Additional CSS for TOTP input
 */
export const twoFactorStyles: string = `
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
