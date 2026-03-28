// JavaScript for the CMS UI
// Served as an external script for strict CSP compliance

/**
 * CMS client-side script content
 *
 * All JavaScript is served from a single external file to enable
 * strict Content Security Policy (script-src 'self') without hashes or unsafe-inline.
 */
export const cmsScript: string = `
(function() {
  'use strict';

  // Confirmation dialog via data-confirm attribute
  // Usage: <button data-confirm="Are you sure?">Delete</button>
  // Works on buttons, links, and form submit buttons
  document.addEventListener('click', function(e) {
    var target = e.target.closest('[data-confirm]');
    if (!target) return;

    var message = target.getAttribute('data-confirm');
    if (!confirm(message)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
})();
`;
