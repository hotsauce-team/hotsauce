// Script route handler
// JavaScript content lives in @hotsauce/ui, this file handles HTTP serving

import { cmsScript, pickerScript } from '@hotsauce/ui';

// Re-export for convenience
export { cmsScript, pickerScript } from '@hotsauce/ui';

/**
 * Create a JavaScript response with caching headers
 */
export function jsResponse(js: string): Response {
  return new Response(js, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}

/**
 * Handle script request at {basePath}/admin.js
 */
export function handleScript(): Response {
  return jsResponse(cmsScript);
}

/**
 * Handle picker script request at {basePath}/picker.js
 */
export function handlePickerScript(): Response {
  return jsResponse(pickerScript);
}
