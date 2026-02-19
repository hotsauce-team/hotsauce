// deno-lint-ignore-file no-explicit-any
/**
 * Client-side globals exposed by the CMS Puck editor bundle.
 *
 * Import these in your components file instead of accessing globalThis directly:
 *
 * ```ts
 * import { React, DropZone } from '@hotsauce/plugins/puck/client/globals';
 * ```
 *
 * These are only available at runtime after puck-editor.js has loaded.
 */

import type { default as ReactType } from 'npm:react@18.2.0';

/** React instance from the CMS bundle (available after puck-editor.js loads) */
export const React = (globalThis as any).React as typeof ReactType;

/** DropZone component for nested content areas in Puck */
export const DropZone = (globalThis as any).PuckDropZone as ReactType.FC<{
  zone: string;
}>;
