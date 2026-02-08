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

  // Save handler
  const save = (data: unknown) => {
    const url =
      `${bootstrap.basePath}/puck/${bootstrap.table}/${bootstrap.recordId}/${bootstrap.column}`;
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': bootstrap.csrfToken,
      },
      body: JSON.stringify({ data }),
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
