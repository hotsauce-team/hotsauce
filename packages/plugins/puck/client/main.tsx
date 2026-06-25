/// <reference lib="dom" />

/**
 * Puck Editor - CMS Bundle
 *
 * This is the CMS-provided bundle containing React + Puck.
 * Users provide their own components.js bundle built separately.
 *
 * Build with: deno task build:puck (from workspace root)
 */

import React from 'npm:react@19.2.4';
import type { ComponentProps } from 'npm:react@19.2.4';
import { createRoot } from 'npm:react-dom@19.2.4/client';
import { type Data, DropZone, Puck } from 'npm:@puckeditor/core@0.21.1';

type _PuckProps = ComponentProps<typeof Puck>;

// Expose React and Puck components globally so user components can access them
// deno-lint-ignore no-explicit-any
(globalThis as any).React = React;
// deno-lint-ignore no-explicit-any
(globalThis as any).PuckDropZone = DropZone;

// CMS context for custom fields (basePath, sourceToken, etc.).
// Populated by initPuckEditor() before user components are loaded — user
// modules are loaded via dynamic import() inside initPuckEditor, so CmsContext
// is always set before any user module code executes. Do not read CmsContext
// at the top level of a module; always read it inside a function or component.
// deno-lint-ignore no-explicit-any
(globalThis as any).CmsContext = {} as {
  basePath: string;
  sourceToken: string;
};

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
  data: Partial<Data>;
}

// User's puckProps type (mirrors PuckProps from types.ts)
type PuckProps = Partial<_PuckProps> & { config: _PuckProps['config'] };

// User's components module exports puckProps with config inside
interface UserComponentsModule {
  /** Puck props including config, viewports, permissions, etc. */
  puckProps: PuckProps;
}

/**
 * Initialize the Puck editor.
 * Reads configuration from a `<script type="application/json" id="puck-config">` element.
 * Called automatically when this module is loaded as `<script type="module" src="...">`.
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

  // Populate CMS context for custom fields before loading user components
  // deno-lint-ignore no-explicit-any
  (globalThis as any).CmsContext = {
    basePath: options.basePath,
    sourceToken: options.sourceToken,
  };

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

  const { puckProps } = userModule;
  if (!puckProps?.config?.components) {
    // deno-lint-ignore no-console
    console.error(
      '[Puck] Components module must export "puckProps" with "config.components"',
    );
    rootEl.innerHTML = `<div style="color: red; padding: 2rem;">
      <h2>Invalid components module</h2>
      <p>The components file must export "puckProps" with a "config" containing "components".</p>
      <pre>export const puckProps = { config: { components: { ... } } } satisfies Partial&lt;PuckProps&gt;;</pre>
    </div>`;
    return;
  }

  // Save handler - POST to CMS update endpoint
  const handlePublish = async (data: unknown) => {
    const url = `${options.basePath}/${options.table}/${options.recordId}`;

    const formData = new FormData();
    formData.append(options.column, JSON.stringify(data));
    formData.append('__cms_csrf', options.csrfToken);
    formData.append('__cms_source', options.sourceToken);

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

  // Use user's onPublish if provided, otherwise use our save handler
  const onPublish = puckProps.onPublish ?? handlePublish;

  // Render Puck editor with user's props spread
  createRoot(rootEl).render(
    <Puck
      {...puckProps}
      data={options.data}
      onPublish={onPublish}
    />,
  );
}

// Also export for direct use if needed
export { Puck, React };

// Auto-initialize from DOM config when loaded as <script type="module" src="...">
const configEl = document.getElementById('puck-config');
if (configEl?.textContent) {
  try {
    const options: PuckEditorOptions = JSON.parse(configEl.textContent);
    initPuckEditor(options);
  } catch (err) {
    // deno-lint-ignore no-console
    console.error('[Puck] Failed to parse config from #puck-config:', err);
  }
}
