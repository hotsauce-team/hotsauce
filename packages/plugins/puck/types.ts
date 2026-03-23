/**
 * Type definitions for Puck editor integration
 *
 * Export `puckProps` with all Puck configuration in one place:
 * ```ts
 * import type { ComponentConfig, PuckProps, React } from '@hotsauce/plugins/puck/types';
 *
 * const Heading: ComponentConfig = { ... };
 *
 * export const puckProps: PuckProps = {
 *   headerTitle: 'Page Builder',
 *   viewports: [{ width: 1440 }, { width: 768 }],
 *   config: {
 *     components: { Heading, ... },
 *     root: { ... },
 *   },
 * };
 * ```
 *
 * Types are erased at bundle time - this is purely for editor intellisense.
 *
 * @module
 */

import type ReactNamespace from 'npm:react@19.2.4';
import type { ComponentProps } from 'npm:react@19.2.4';

/**
 * Re-export React types so users stay in sync with CMS version.
 * Use: `const React = (globalThis as any).React as typeof ReactType;`
 */
export type { ReactNamespace as React };

/**
 * Internal: Raw props from Puck's component signature.
 * Use `PuckProps` instead for user exports.
 *
 * Uses dynamic import in type position to avoid runtime side effects.
 */
export type _PuckProps = ComponentProps<
  typeof import('npm:@puckeditor/core@0.21.1').Puck
>;

/**
 * Props for user's puckProps export.
 * `config` is required; `data` and `onPublish` are injected by CMS at runtime.
 */
export type PuckProps = Partial<_PuckProps> & { config: _PuckProps['config'] };

/**
 * Type for a single Puck component configuration.
 * Use this to type your individual components before adding them to config.
 */
export type ComponentConfig =
  import('npm:@puckeditor/core@0.21.1').ComponentConfig;
