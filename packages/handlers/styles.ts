// Stylesheet route handler
// CSS content lives in @drizzle-cms/ui, this file handles HTTP serving

import { cmsStylesheet } from '@drizzle-cms/ui';
import { accountStyles, loginStyles, twoFactorStyles } from '@drizzle-cms/auth';

// Re-export for convenience
export { cmsStylesheet } from '@drizzle-cms/ui';

// Combined stylesheet (CMS base + auth styles + account styles)
const fullStylesheet = cmsStylesheet + '\n' + loginStyles + '\n' +
  twoFactorStyles + '\n' + accountStyles;

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
