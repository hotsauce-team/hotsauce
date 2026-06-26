// CSS styles for the CMS UI
// Served as an external stylesheet for strict CSP compliance

/**
 * CMS stylesheet content
 *
 * All CSS is served from a single external file to enable
 * strict Content Security Policy (style-src 'self') without nonces.
 */
export const cmsStylesheet: string = `
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
  --cms-gray-400: #9ca3af;
  --cms-gray-500: #6b7280;
  --cms-gray-600: #4b5563;
  --cms-gray-700: #374151;
  --cms-gray-800: #1f2937;
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

.cms-nav-divider {
  height: 1px;
  background: var(--cms-gray-700);
  margin: 0.5rem 1rem;
}

/* Breadcrumbs */
.cms-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--cms-gray-500);
  margin-bottom: 1rem;
}
.cms-breadcrumb-link {
  color: var(--cms-primary);
  text-decoration: none;
}
.cms-breadcrumb-link:hover {
  text-decoration: underline;
}
.cms-breadcrumb-sep {
  color: var(--cms-gray-400);
}
.cms-breadcrumb-current {
  color: var(--cms-gray-700);
  font-weight: 500;
}

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

.cms-user {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cms-user-name {
  color: var(--cms-gray-600);
  font-size: 0.875rem;
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
  line-height: 1.25;
  box-sizing: border-box;
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

.cms-btn-text {
  background: transparent;
  color: var(--cms-primary);
  padding: 0.5rem 0.75rem;
}
.cms-btn-text:hover { background: var(--cms-gray-100); }

.cms-btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

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

/* File Upload */
.cms-file-input-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }
.cms-file-icon { font-size: 1.25rem; }
.cms-file-name { font-weight: 500; }
.cms-file-size { color: var(--cms-gray-500); font-size: 0.875rem; }
.cms-file-help { color: var(--cms-gray-500); font-size: 0.75rem; margin: 0; }
.cms-input-file { padding: 0.5rem; }

/* File Display (list/detail views) */
.cms-file-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: var(--cms-gray-100);
  border-radius: var(--cms-radius);
  font-size: 0.875rem;
}
.cms-file-display {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cms-file-display .cms-file-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cms-file-display .cms-file-meta { color: var(--cms-gray-500); font-size: 0.875rem; }
.cms-file-display .cms-file-preview {
  max-width: 100%;
  max-height: 300px;
  border-radius: var(--cms-radius);
  border: 1px solid var(--cms-gray-200);
  object-fit: contain;
}
.cms-file-preview {
  max-width: 100px;
  max-height: 100px;
  border-radius: var(--cms-radius);
  border: 1px solid var(--cms-gray-200);
  object-fit: contain;
}
.cms-file-current {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--cms-gray-50);
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  margin-bottom: 0.5rem;
}
.cms-file-current .cms-file-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.cms-file-current .cms-file-preview {
  max-width: 100px;
  max-height: 100px;
}
.cms-file-link {
  color: var(--cms-primary);
  text-decoration: none;
  font-size: 0.875rem;
}
.cms-file-link:hover { text-decoration: underline; }

.cms-error { color: var(--cms-danger); font-size: 0.875rem; margin: 0.25rem 0 0; }
.cms-help { color: var(--cms-gray-500); font-size: 0.875rem; margin: 0.25rem 0 0; }

/* Value summary - human-readable replacement for raw data */
.cms-value-summary {
  padding: 0.5rem 0.75rem;
  background: var(--cms-gray-100);
  border-radius: var(--cms-radius);
  font-size: 0.875rem;
  color: var(--cms-gray-600);
  margin: 0;
}

/* Field override - plugin-provided link */
.cms-field-override {
  margin-top: 0.5rem;
}

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

/*
 * Clamp plain-text cell content to 2 lines. Applied only to .cms-cell-text
 * (emitted for plain-text list values), so trusted cell markup — file badges,
 * JSON tags, plugin links, action buttons — is never clamped or hidden.
 */
.cms-cell-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
.cms-action-delete {
  color: var(--cms-danger);
  background: var(--cms-gray-100);
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  padding: 0.25rem 0.5rem;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}
.cms-action-delete:hover {
  background: #fee2e2;
  border-color: var(--cms-danger);
  text-decoration: none;
}
.cms-action-form { display: inline; }

.cms-null { color: var(--cms-gray-500); }
.cms-bool-true { color: var(--cms-success); }
.cms-bool-false { color: var(--cms-gray-500); }

/* View Toggle */
.cms-list-actions { display: flex; gap: 0.5rem; align-items: center; }
.cms-view-toggle { display: flex; border: 1px solid var(--cms-gray-200); border-radius: var(--cms-radius); overflow: hidden; }
.cms-view-toggle-btn {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem;
  text-decoration: none; color: var(--cms-gray-500);
  background: white; border-right: 1px solid var(--cms-gray-200);
  font-size: 1rem; line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.cms-view-toggle-btn:last-child { border-right: none; }
.cms-view-toggle-btn:hover { background: var(--cms-gray-100); color: var(--cms-gray-700); }
.cms-view-toggle-btn.cms-view-toggle-active { background: var(--cms-gray-100); color: var(--cms-gray-900); font-weight: 600; }

/* Media Grid */
.cms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1rem;
}
.cms-grid-item {
  display: flex; flex-direction: column;
  background: white;
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  overflow: hidden;
  text-decoration: none; color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cms-grid-item:hover {
  border-color: var(--cms-gray-300);
  box-shadow: var(--cms-shadow);
}
.cms-grid-item-selected {
  border-color: var(--cms-primary);
  box-shadow: 0 0 0 1px var(--cms-primary);
}
.cms-grid-thumb {
  width: 100%; aspect-ratio: 1;
  object-fit: cover;
  background: var(--cms-gray-100);
}
.cms-grid-placeholder {
  width: 100%; aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  background: var(--cms-gray-100);
  color: var(--cms-gray-400);
  font-size: 0.875rem;
}
.cms-grid-label {
  padding: 0.5rem;
  font-size: 0.8125rem;
  color: var(--cms-gray-700);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Grid + Panel Layout */
.cms-grid-panel-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}
.cms-grid-panel-layout .cms-grid-main { flex: 1; min-width: 0; }
.cms-grid-panel {
  width: 380px;
  flex-shrink: 0;
  background: white;
  border: 1px solid var(--cms-gray-200);
  border-radius: var(--cms-radius);
  box-shadow: var(--cms-shadow);
  overflow-y: auto;
  max-height: calc(100vh - 10rem); /* stay within viewport minus layout chrome */
  position: sticky; /* follow scroll while grid content scrolls */
  top: 1.5rem;
}
.cms-panel-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--cms-gray-200);
}
.cms-panel-close {
  display: flex; align-items: center; justify-content: center;
  width: 1.75rem; height: 1.75rem;
  border-radius: var(--cms-radius);
  text-decoration: none; color: var(--cms-gray-400);
  font-size: 1rem; line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.cms-panel-close:hover { background: var(--cms-gray-100); color: var(--cms-gray-700); }
.cms-panel-preview {
  width: 100%; max-height: 280px;
  object-fit: contain;
  background: var(--cms-gray-100);
  display: block;
}
.cms-panel-preview-placeholder {
  width: 100%; height: 160px;
  display: flex; align-items: center; justify-content: center;
  background: var(--cms-gray-100);
  color: var(--cms-gray-400);
  font-size: 0.875rem;
}
.cms-panel-meta {
  display: grid; grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--cms-gray-200);
  margin: 0;
  font-size: 0.8125rem;
}
.cms-panel-meta dt { color: var(--cms-gray-500); font-weight: 500; }
.cms-panel-meta dd { margin: 0; color: var(--cms-gray-800); word-break: break-all; }
.cms-panel-form { padding: 1rem; }
.cms-panel-form .cms-form-actions { padding-top: 0.5rem; }
.cms-panel-danger {
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--cms-gray-200);
}
/* Stack panel below grid on narrow viewports */
@media (max-width: 900px) {
  .cms-grid-panel-layout { flex-direction: column; }
  .cms-grid-panel { width: 100%; max-height: none; position: static; }
}

/* Picker Mode (iframe-embedded grid for media selection) */
.cms-picker-body {
  margin: 0;
  padding: 1rem;
  background: var(--cms-gray-100);
}
.cms-picker-view { max-width: 100%; }
.cms-picker-header { margin-bottom: 1rem; }
.cms-picker-header h2 { margin: 0; font-size: 1.25rem; color: var(--cms-gray-800); }
.cms-grid-picker-item {
  cursor: pointer;
  border: 2px solid transparent;
  background: white;
  padding: 0;
  text-align: left;
  width: 100%;
}
.cms-grid-picker-item:hover { border-color: var(--cms-primary); }
.cms-grid-picker-item:focus { outline: 2px solid var(--cms-primary); outline-offset: 2px; }

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

.cms-detail-actions { display: flex; gap: 0.5rem; align-items: stretch; }
.cms-inline-form { display: contents; }

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

/* Mobile Navigation (Popover API) */
.cms-menu-toggle {
  display: none;
  background: var(--cms-gray-900);
  color: white;
  border: none;
  border-radius: var(--cms-radius);
  padding: 0.5rem;
  cursor: pointer;
  flex-shrink: 0;
}

.cms-menu-toggle:hover {
  background: var(--cms-gray-700);
}

/* Fallback: sidebar always visible if popover not supported */
@media (max-width: 768px) {
  .cms-layout {
    flex-direction: column;
  }

  .cms-sidebar {
    width: 100%;
  }
}

/* Popover-enabled mobile navigation */
@supports selector(:popover-open) {
  @media (max-width: 768px) {
    .cms-menu-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cms-sidebar[popover] {
      position: fixed;
      inset: 0 auto 0 0;
      width: 240px;
      height: 100%;
      margin: 0;
      border: none;
      padding: 1rem 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .cms-sidebar::backdrop {
      background: rgba(0, 0, 0, 0.4);
    }

    .cms-header {
      gap: 1rem;
      justify-content: flex-start;
    }

    .cms-user {
      margin-left: auto;
    }
  }

  @media (min-width: 769px) {
    /* On desktop, sidebar is always visible (override popover hidden state) */
    .cms-sidebar[popover] {
      display: block;
      position: static;
      height: auto;
      border: none;
      margin: 0;
    }
  }
}
`;
