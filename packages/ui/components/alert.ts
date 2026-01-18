// Alert/message component

import { html, attrs } from '../html.ts';

/**
 * Alert type
 */
export type AlertType = 'success' | 'error' | 'warning' | 'info';

/**
 * Render an alert message
 */
export function alert(message: string, type: AlertType = 'info'): string {
  return html`<div ${attrs({
    class: `cms-alert cms-alert-${type}`,
    role: 'alert',
  })}>
  ${message}
</div>`;
}

/**
 * Flash message styles (add to defaultStyles if using flash messages)
 */
export const alertStyles = `
  .cms-alert {
    padding: 0.75rem 1rem;
    border-radius: var(--cms-radius);
    margin-bottom: 1rem;
  }
  .cms-alert-success { background: #dcfce7; color: #166534; }
  .cms-alert-error { background: #fee2e2; color: #991b1b; }
  .cms-alert-warning { background: #fef3c7; color: #92400e; }
  .cms-alert-info { background: #dbeafe; color: #1e40af; }
`;
