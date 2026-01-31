// Stylesheet route handler
// CSS content lives in @hotsauce/ui, this file handles HTTP serving

import { cmsStylesheet } from '@hotsauce/ui';
import { accountStyles, loginStyles, twoFactorStyles } from '@hotsauce/auth';

// Re-export for convenience
export { cmsStylesheet } from '@hotsauce/ui';

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
