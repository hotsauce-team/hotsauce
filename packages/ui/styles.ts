// CSS styles for the CMS UI
// Served as an external stylesheet for strict CSP compliance

/**
 * CMS stylesheet content
 * 
 * All CSS is served from a single external file to enable
 * strict Content Security Policy (style-src 'self') without nonces.
 */
export const cmsStylesheet = `
:root {
  --cms-primary: #2563eb;
  --cms-primary-hover: #1d4ed8;
  --cms-danger: #dc2626;
  --cms-danger-hover: #b91c1c;
  --cms-success: #16a34a;
  --cms-gray-50: #f9fafb;
  --cms-gray-100: #f3f4f6;
  --cms-gray-200: #e5e7eb;
  --cms-gray-300: #d1d5db;
  --cms-gray-500: #6b7280;
  --cms-gray-700: #374151;
  --cms-gray-900: #111827;
  --cms-radius: 6px;
  --cms-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

* { box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  color: var(--cms-gray-900);
  background: var(--cms-gray-50);
  margin: 0;
}

.cms-layout {
  display: flex;
  min-height: 100vh;
}

.cms-sidebar {
  width: 240px;
  background: var(--cms-gray-900);
  color: white;
  padding: 1rem 0;
  flex-shrink: 0;
}

.cms-sidebar-header {
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--cms-gray-700);
  margin-bottom: 1rem;
}

.cms-sidebar-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.cms-nav { list-style: none; margin: 0; padding: 0; }

.cms-nav-item a {
  display: block;
  padding: 0.5rem 1rem;
  color: var(--cms-gray-300);
  text-decoration: none;
  transition: background 0.15s;
}

.cms-nav-item a:hover,
.cms-nav-item.active a {
  background: var(--cms-gray-700);
  color: white;
}

.cms-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.cms-header {
  background: white;
  border-bottom: 1px solid var(--cms-gray-200);
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cms-content {
  padding: 1.5rem;
  flex: 1;
}

/* Buttons */
.cms-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: var(--cms-radius);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.cms-btn-primary {
  background: var(--cms-primary);
  color: white;
}
.cms-btn-primary:hover { background: var(--cms-primary-hover); }

.cms-btn-secondary {
  background: var(--cms-gray-200);
  color: var(--cms-gray-700);
}
.cms-btn-secondary:hover { background: var(--cms-gray-300); }

.cms-btn-danger {
  background: var(--cms-danger);
  color: white;
}
.cms-btn-danger:hover { background: var(--cms-danger-hover); }

/* Forms */
.cms-form { max-width: 640px; }

.cms-field {
  margin-bottom: 1rem;
}

.cms-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: var(--cms-gray-700);
}

.cms-required { color: var(--cms-danger); margin-left: 2px; }

.cms-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--cms-gray-300);
  border-radius: var(--cms-radius);
  font-size: 1rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.cms-input:focus {
  outline: none;
  border-color: var(--cms-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.cms-input:disabled {
  background: var(--cms-gray-100);
  cursor: not-allowed;
}

.cms-checkbox { width: auto; }

.cms-textarea, .cms-json {
  font-family: inherit;
  resize: vertical;
  min-height: 120px;
}

.cms-json { font-family: monospace; font-size: 0.875rem; }

.cms-error { color: var(--cms-danger); font-size: 0.875rem; margin: 0.25rem 0 0; }
.cms-help { color: var(--cms-gray-500); font-size: 0.875rem; margin: 0.25rem 0 0; }

.cms-field-error .cms-input {
  border-color: var(--cms-danger);
}

.cms-form-actions {
  margin-top: 1.5rem;
  display: flex;
  gap: 0.5rem;
}

/* Tables */
.cms-table {
  width: 100%;
  background: white;
  border-radius: var(--cms-radius);
  box-shadow: var(--cms-shadow);
  border-collapse: collapse;
}

.cms-th {
  text-align: left;
  padding: 0.75rem 1rem;
  font-weight: 600;
  color: var(--cms-gray-700);
  background: var(--cms-gray-50);
  border-bottom: 2px solid var(--cms-gray-200);
}

.cms-td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--cms-gray-200);
}

.cms-tr:hover { background: var(--cms-gray-50); }

.cms-actions { white-space: nowrap; }

.cms-action {
  color: var(--cms-primary);
  text-decoration: none;
  font-size: 0.875rem;
  margin-right: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.cms-action:hover { text-decoration: underline; }
.cms-action-delete { color: var(--cms-danger); }
.cms-action-form { display: inline; }

.cms-null { color: var(--cms-gray-500); }
.cms-bool-true { color: var(--cms-success); }
.cms-bool-false { color: var(--cms-gray-500); }

/* Views */
.cms-list-header, .cms-detail-header, .cms-edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.cms-list-header h1, .cms-detail-header h1, .cms-edit-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.cms-detail-actions { display: flex; gap: 0.5rem; }
.cms-inline-form { display: inline; }

.cms-detail-list {
  background: white;
  border-radius: var(--cms-radius);
  box-shadow: var(--cms-shadow);
  padding: 1.5rem;
  margin: 0;
}

.cms-detail-field {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--cms-gray-200);
}

.cms-detail-field:last-child { border-bottom: none; }

.cms-detail-label {
  font-weight: 500;
  color: var(--cms-gray-700);
}

.cms-detail-value { margin: 0; }
.cms-detail-value pre { margin: 0; overflow-x: auto; }

.cms-empty {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: var(--cms-radius);
  box-shadow: var(--cms-shadow);
}

.cms-empty p {
  color: var(--cms-gray-500);
  margin: 0 0 1rem;
}

/* Alerts */
.cms-alert {
  padding: 0.75rem 1rem;
  border-radius: var(--cms-radius);
  margin-bottom: 1rem;
  font-weight: 500;
}
.cms-alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
.cms-alert-error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
.cms-alert-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
.cms-alert-info { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }

/* Dashboard */
.cms-table-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.cms-table-card {
  display: block;
  padding: 1rem;
  background: var(--cms-gray-100);
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  text-decoration: none;
  color: inherit;
  transition: background 0.15s, border-color 0.15s;
}

.cms-table-card:hover {
  background: var(--cms-gray-200);
  border-color: var(--cms-gray-300);
}

.cms-table-card h3 {
  margin: 0 0 0.5rem;
  color: var(--cms-gray-900);
}

.cms-table-card p {
  margin: 0;
  color: var(--cms-gray-500);
  font-size: 0.875rem;
}

/* Pagination */
.cms-pagination {
  display: flex;
  gap: 0.25rem;
  margin-top: 1rem;
  justify-content: center;
}

.cms-pagination a,
.cms-pagination span {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  text-decoration: none;
  color: var(--cms-gray-700);
  background: white;
  font-size: 0.875rem;
}

.cms-pagination a:hover {
  background: var(--cms-gray-50);
  border-color: var(--cms-gray-300);
}

.cms-pagination .active {
  background: var(--cms-primary);
  border-color: var(--cms-primary);
  color: white;
}

.cms-pagination .disabled {
  color: var(--cms-gray-300);
  cursor: not-allowed;
}
`;
