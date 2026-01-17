// Stylesheet route handler
// CSS content lives in @drizzle-cms/ui, this file handles HTTP serving

import { cmsStylesheet } from '@drizzle-cms/ui';
import { loginStyles } from './auth/mod.ts';

// Re-export for convenience
export { cmsStylesheet } from '@drizzle-cms/ui';

// Combined stylesheet (CMS base + auth styles)
const fullStylesheet = cmsStylesheet + '\n' + loginStyles;

/**
 * Create a CSS response with caching headers
 */
export function cssResponse(css: string): Response {
  return new Response(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}

/**
 * Handle stylesheet request at {basePath}/styles.css
 */
export function handleStylesheet(): Response {
  return cssResponse(fullStylesheet);
}
