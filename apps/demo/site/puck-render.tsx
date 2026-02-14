/** @jsxRuntime classic */
/** @jsx React.createElement */
/**
 * Server-side Puck rendering
 *
 * Renders Puck JSON content to HTML using Puck's Render component
 * and React's renderToString. No client-side JavaScript needed.
 */

import React from 'npm:react@18.2.0';
import { renderToStaticMarkup } from 'npm:react-dom@18.2.0/server';
import { type Config, Render } from 'npm:@puckeditor/core@0.21.1';

// Set globalThis.React BEFORE any dynamic imports
// deno-lint-ignore no-explicit-any
(globalThis as any).React = React;
// deno-lint-ignore no-explicit-any
(globalThis as any).PuckDropZone = ({ zone }: { zone: string }) => (
  <div data-puck-zone={zone}>
    {/* DropZone placeholder - zones are only interactive in editor */}
  </div>
);

// Puck data structure
interface PuckData {
  root?: { props?: Record<string, unknown> };
  content?: Array<{
    type: string;
    props: Record<string, unknown>;
  }>;
  zones?: Record<
    string,
    Array<{
      type: string;
      props: Record<string, unknown>;
    }>
  >;
}

// Cache for components config (loaded once)
let componentsConfig: Config['components'] | null = null;

/**
 * Load components dynamically (after globalThis.React is set)
 */
async function getComponentsConfig(): Promise<Config['components']> {
  if (componentsConfig) return componentsConfig;

  // Dynamic import ensures globalThis.React is set before module evaluation
  const mod = await import('../components.tsx');
  componentsConfig = mod.config;
  return componentsConfig;
}

/**
 * Render Puck JSON content to HTML string
 */
export async function renderPuckContent(
  data: PuckData | null,
): Promise<string> {
  if (!data || !data.content || data.content.length === 0) {
    return '<p>No content</p>';
  }

  const components = await getComponentsConfig();

  // Build Puck config with user components
  const config: Config = {
    components,
  };

  // Use Puck's Render component to generate React elements, then render to static HTML
  const element = <Render config={config} data={data} />;
  return renderToStaticMarkup(element);
}
