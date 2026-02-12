/**
 * Puck Editor Client Entry Point
 *
 * Bundled with `deno task build:puck` into a single JS file.
 */

import React from 'npm:react@18.2.0';
import { createRoot } from 'npm:react-dom@18.2.0/client';
import { Puck } from 'npm:@puckeditor/core@0.21.1';

// Puck component config (following install guide)
const config = {
  components: {
    HeadingBlock: {
      fields: {
        children: {
          type: 'text' as const,
        },
      },
      render: ({ children }: { children?: string }) => {
        return <h1>{children}</h1>;
      },
    },
  },
};

// Initialize the app
function init() {
  const rootEl = document.getElementById('puck-root');
  if (!rootEl) return;

  // Read bootstrap data from server
  const bootstrapEl = document.getElementById('puck-bootstrap');
  const bootstrap = bootstrapEl?.textContent
    ? JSON.parse(bootstrapEl.textContent)
    : {};

  // Save handler - POST to CMS update endpoint with form data
  const save = (data: unknown) => {
    // Use standard CMS update endpoint (applies policies, runs plugins)
    const url =
      `${bootstrap.basePath}/${bootstrap.table}/${bootstrap.recordId}`;

    // Send as form data - CMS parses JSON strings for json/jsonb columns
    const formData = new FormData();
    formData.append(bootstrap.column, JSON.stringify(data));
    formData.append('_csrf', bootstrap.csrfToken);
    formData.append('_source', bootstrap.sourceToken);

    fetch(url, {
      method: 'POST',
      body: formData,
    }).then((res) => {
      if (res.ok) alert('Saved!');
      else alert('Save failed: ' + res.status);
    });
  };

  // Start with empty canvas
  const initialData = {
    content: [],
    root: { props: {} },
  };

  // Render Puck editor
  createRoot(rootEl).render(
    <Puck
      config={config}
      data={bootstrap.data || initialData}
      onPublish={save}
    />,
  );
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
