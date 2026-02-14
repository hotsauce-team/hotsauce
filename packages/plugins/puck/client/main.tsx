/**
 * Puck Editor - CMS Bundle
 *
 * This is the CMS-provided bundle containing React + Puck.
 * Users provide their own components.js bundle built separately.
 *
 * Build with: deno task build:puck (from workspace root)
 */

import React from 'npm:react@18.2.0';
import { createRoot } from 'npm:react-dom@18.2.0/client';
import { type Config, DropZone, Puck } from 'npm:@puckeditor/core@0.21.1';

// Expose React and Puck components globally so user components can access them
// deno-lint-ignore no-explicit-any
(globalThis as any).React = React;
// deno-lint-ignore no-explicit-any
(globalThis as any).PuckDropZone = DropZone;

// Types for editor initialization
export interface PuckEditorOptions {
  /** URL to user's components bundle (ES module) */
  componentsUrl: string;
  /** Table name for the record being edited */
  table: string;
  /** Record ID being edited */
  recordId: string;
  /** Column containing Puck data */
  column: string;
  /** CSRF token for save requests */
  csrfToken: string;
  /** Source token for form validation */
  sourceToken: string;
  /** CMS base path (e.g., '/admin') */
  basePath: string;
  /** Initial Puck data */
  data: {
    content: unknown[];
    root: { props: Record<string, unknown> };
  };
}

// User's components module exports a full Puck Config
interface UserComponentsModule {
  config: Config;
}

/**
 * Initialize the Puck editor.
 * Call this from your page with configuration options.
 */
export async function initPuckEditor(
  options: PuckEditorOptions,
): Promise<void> {
  const rootEl = document.getElementById('puck-root');
  if (!rootEl) {
    // deno-lint-ignore no-console
    console.error('[Puck] Root element #puck-root not found');
    return;
  }

  // Dynamic import user's components
  let userModule: UserComponentsModule;
  try {
    userModule = await import(options.componentsUrl);
  } catch (err) {
    // deno-lint-ignore no-console
    console.error(
      `[Puck] Failed to load components from ${options.componentsUrl}:`,
      err,
    );
    rootEl.innerHTML = `<div style="color: red; padding: 2rem;">
      <h2>Failed to load components</h2>
      <p>Could not load: ${options.componentsUrl}</p>
      <pre>${err}</pre>
    </div>`;
    return;
  }

  if (!userModule.config || !userModule.config.components) {
    // deno-lint-ignore no-console
    console.error(
      '[Puck] Components module must export "config" with "components"',
    );
    rootEl.innerHTML = `<div style="color: red; padding: 2rem;">
      <h2>Invalid components module</h2>
      <p>The components file must export a "config" object with a "components" property.</p>
      <pre>export const config: Config = { components: { ... }, root: { ... } };</pre>
    </div>`;
    return;
  }

  // Save handler - POST to CMS update endpoint
  const handlePublish = async (data: unknown) => {
    const url = `${options.basePath}/${options.table}/${options.recordId}`;

    const formData = new FormData();
    formData.append(options.column, JSON.stringify(data));
    formData.append('_csrf', options.csrfToken);
    formData.append('_source', options.sourceToken);

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        // Visual feedback
        const btn = document.querySelector('[class*="publish"]') as HTMLElement;
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '✓ Saved!';
          setTimeout(() => btn.textContent = orig, 2000);
        }
      } else {
        const text = await res.text();
        alert(`Save failed: ${res.status}\n${text}`);
      }
    } catch (err) {
      alert(`Save failed: ${err}`);
    }
  };

  // Render Puck editor
  createRoot(rootEl).render(
    <Puck
      config={userModule.config}
      data={options.data}
      onPublish={handlePublish}
    />,
  );
}

// Also export for direct use if needed
export { Puck, React };
