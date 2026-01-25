/**
 * Markdown rendering Worker plugin for drizzle-cms
 *
 * Converts markdown `content` to HTML `contentHtml` at save time.
 * Runs in an isolated Web Worker for demonstration purposes.
 *
 * Uses vendored snarkdown parser (inline) - zero dependencies.
 */

/// <reference lib="webworker" />
/// <reference types="@drizzle-cms/handlers-workers" />

import type {
  PluginContext,
  Serializable,
} from '@drizzle-cms/handlers-workers';
import { parseMarkdown } from '../lib/markdown.ts';
import { sanitizeHtml } from '../lib/sanitize.ts';

// Declare Worker globals for TypeScript
declare const self: DedicatedWorkerGlobalScope;

// ─────────────────────────────────────────────────────────────
// Worker message types (local definition per audit-log pattern)
// ─────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: string;
  type: string;
  payload: Serializable;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: Serializable;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Worker message handler
// ─────────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    let result: Serializable = null;

    switch (type) {
      case 'init': {
        // deno-lint-ignore no-console
        console.log('[markdown] Plugin initialized');
        result = { success: true };
        break;
      }

      case 'transform:beforeSave': {
        const transformPayload = payload as unknown as {
          ctx: PluginContext;
          data: Record<string, Serializable>;
        };
        const { data } = transformPayload;

        // Always sync contentHtml when content field exists
        if (typeof data.content === 'string') {
          const trimmed = data.content.trim();
          // Parse markdown then sanitize to prevent XSS
          const unsafeHtml = trimmed ? parseMarkdown(data.content) : '';
          result = {
            ...data,
            contentHtml: sanitizeHtml(unsafeHtml),
          } as Serializable;
        } else {
          result = data as Serializable;
        }
        break;
      }

      case 'transform:afterRead': {
        // Pass through unchanged
        const transformPayload = payload as unknown as {
          ctx: PluginContext;
          data: Record<string, Serializable>;
        };
        if (typeof transformPayload.data.contentHtml === 'string') {
          // Change the string to something like 'Managed by markdown worker'
          transformPayload.data.contentHtml =
            'This column is handled by markdown plugin';
        }
        result = transformPayload.data as Serializable;
        break;
      }

      case 'action': {
        // No action hooks - just acknowledge
        result = null;
        break;
      }

      default:
        result = null;
    }

    const response: WorkerResponse = { id, success: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

// deno-lint-ignore no-console
console.log('[markdown] Worker loaded');
