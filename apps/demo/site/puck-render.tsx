/** @jsxRuntime classic */
/** @jsx React.createElement */
/**
 * Server-side Puck rendering
 *
 * Renders Puck JSON content to HTML using Puck's Render component
 * and React's renderToString. No client-side JavaScript needed.
 *
 * Uses the RSC (React Server Components) export to avoid loading
 * browser-only dependencies like happy-dom/ws.
 */

import React from 'npm:react@18.2.0';
import { renderToStaticMarkup } from 'npm:react-dom@18.2.0/server';
import { type Config, type Data } from 'npm:@puckeditor/core@0.21.1';
import { Render } from 'npm:@puckeditor/core@0.21.1/rsc';

// Set globalThis.React BEFORE any dynamic imports
// deno-lint-ignore no-explicit-any
(globalThis as any).React = React;
// deno-lint-ignore no-explicit-any
(globalThis as any).PuckDropZone = ({ zone }: { zone: string }) => (
  <div data-puck-zone={zone}>
    {/* DropZone placeholder - zones are only interactive in editor */}
  </div>
);

// Cache for puck config (loaded once)
let puckConfig: Config | null = null;

/**
 * Load components dynamically (after globalThis.React is set)
 */
async function getPuckConfig(): Promise<Config> {
  if (puckConfig) return puckConfig;

  // Dynamic import ensures globalThis.React is set before module evaluation
  const mod = await import('../components.tsx');
  puckConfig = mod.puckProps.config;
  return puckConfig;
}

/**
 * Render Puck JSON content to HTML string
 */
export async function renderPuckContent(
  data: Data | null,
): Promise<string> {
  if (!data || !data.content || data.content.length === 0) {
    return '<p>No content</p>';
  }

  const config = await getPuckConfig();

  // Use Puck's Render component to generate React elements, then render to static HTML
  const element = <Render config={config} data={data} />;
  return renderToStaticMarkup(element);
}
