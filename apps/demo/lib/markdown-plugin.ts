/**
 * Markdown Transform Plugin
 *
 * Transforms markdown columns to HTML using schema-driven scoping.
 * The CMS automatically invokes this plugin only for columns marked with:
 * `$cms({ plugins: { markdown: { role: 'source', output: '...' } } })`
 *
 * @example
 * ```ts
 * // In CMS config:
 * plugins: [createMarkdownPlugin({ parse: parseMarkdown, sanitize: sanitizeHtml })]
 *
 * // In schema:
 * content: text('content').$cms({ plugins: { markdown: { role: 'source', output: 'contentHtml' } } }),
 * contentHtml: text('content_html').$cms({ plugins: { markdown: { role: 'output' } } }),
 * ```
 */

import type { InProcessPluginConfig, Serializable } from '@hotsauce/cms';

export interface MarkdownPluginOptions {
  /** Function to parse markdown to HTML */
  parse: (markdown: string) => string;
  /** Function to sanitize HTML (XSS prevention) */
  sanitize: (html: string) => string;
}

/**
 * Create a markdown transform plugin.
 *
 * Uses schema-driven scoping - no discovery needed:
 * - CMS only calls this plugin for columns with `$cms({ plugins: { markdown: ... } })`
 * - Plugin receives `ctx.columns` with each column's config
 * - Plugin receives only declared columns in `data`
 */
export function createMarkdownPlugin(
  options: MarkdownPluginOptions,
): InProcessPluginConfig {
  const { parse, sanitize } = options;

  return {
    name: 'markdown',
    description: 'Renders markdown content to HTML at save time',
    hooks: {
      transform: {
        beforeSave: (ctx, data) => {
          if (!ctx.columns) return data;

          const result: Record<string, Serializable> = { ...data };

          // Process each source column
          for (const [colName, config] of Object.entries(ctx.columns)) {
            const colConfig = config as { role?: string; output?: string };

            // Only transform source columns that have an output target
            if (colConfig?.role === 'source' && colConfig?.output) {
              const sourceValue = data[colName];
              if (typeof sourceValue === 'string') {
                result[colConfig.output] = sanitize(parse(sourceValue));
              }
            }
          }

          return result;
        },
      },
    },
    // Schema-driven: only receives columns with `plugins.markdown` declared
  };
}
