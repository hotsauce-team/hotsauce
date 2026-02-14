/**
 * Type definitions for Puck components
 *
 * Import these in your components.tsx file for IDE support:
 * ```ts
 * import type { React, ComponentConfig, Config } from '@hotsauce/plugins/puck/types';
 * ```
 *
 * Types are erased at bundle time - this is purely for editor intellisense.
 * We re-export Puck's types directly so you get full, accurate definitions.
 *
 * @module
 */

import type ReactNamespace from 'npm:react@18.2.0';

/**
 * Re-export React types so users stay in sync with CMS version.
 * Use: `const React = (globalThis as any).React as typeof ReactType;`
 */
export type { ReactNamespace as React };

// Re-export Puck's types directly — these are the canonical definitions
export type {
  ArrayField,
  // Component configuration
  ComponentConfig,
  ComponentData,
  Config,
  CustomField,
  Data,
  // Props and data types
  DefaultComponentProps,
  DefaultRootProps,
  // UI and state
  DropZone,
  ExternalField,
  // Field types
  Fields,
  NumberField,
  ObjectField,
  Permissions,
  RadioField,
  RootConfig,
  RootData,
  SelectField,
  Slot,
  SlotField,
  TextareaField,
  TextField,
  UiState,
  WithChildren,
  WithPuckProps,
} from 'npm:@puckeditor/core@0.21.1';
