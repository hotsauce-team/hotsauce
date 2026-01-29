import { micromark } from 'micromark';

export function parseMarkdown(markdown: string): string {
  return micromark(markdown);
}
