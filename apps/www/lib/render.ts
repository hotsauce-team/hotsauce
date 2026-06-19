// Minimal HTML rendering with 8-bit inspired aesthetic

import { micromark } from 'micromark';

const BORDER_COLOR = '#d63031';

/** Render markdown to HTML */
export function md(content: string): string {
  return micromark(content);
}

/** Full page layout */
export function layout(title: string, body: string, nav: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — hotsauce-cms</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    html, body { height: 100%; }
    
    body {
      font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'Segoe UI Mono', monospace;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fefefe;
      border: 6px solid ${BORDER_COLOR};
      min-height: 100vh;
      padding: 2rem;
    }
    
    .container {
      max-width: 42rem;
      margin: 0 auto;
    }
    
    header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      color: ${BORDER_COLOR};
      text-decoration: none;
    }
    
    nav {
      margin-top: 0.5rem;
    }
    
    nav a {
      color: #1a1a1a;
      text-decoration: none;
      margin-right: 1.5rem;
    }
    
    nav a:hover {
      color: ${BORDER_COLOR};
    }
    
    nav a::before {
      content: '▸ ';
      color: ${BORDER_COLOR};
    }
    
    main h1, main h2, main h3 {
      margin: 1.5rem 0 0.75rem;
    }
    
    main h1 { font-size: 1.5rem; }
    main h2 { font-size: 1.25rem; }
    main h3 { font-size: 1rem; }
    
    main p {
      margin-bottom: 1rem;
    }
    
    main a {
      color: ${BORDER_COLOR};
    }
    
    main code {
      background: #f5f5f5;
      padding: 0.125rem 0.375rem;
      border: 1px solid #e0e0e0;
      font-size: 0.875em;
    }
    
    main pre {
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
    }
    
    main pre code {
      background: none;
      border: none;
      padding: 0;
    }
    
    main ul, main ol {
      margin: 1rem 0;
      padding-left: 1.5rem;
    }
    
    main li {
      margin-bottom: 0.25rem;
    }
    
    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #e0e0e0;
      font-size: 0.875rem;
      color: #666;
    }
    
    .divider {
      color: #ccc;
      margin: 2rem 0;
      text-align: center;
      letter-spacing: 0.5em;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="/" class="logo">hotsauce-cms</a>
      <nav>${nav}</nav>
    </header>
    <main>
${body}
    </main>
    <footer>
      Built with hotsauce-cms. <a href="https://github.com/hotsauce-team/hotsauce-cms">View source</a>.
    </footer>
  </div>
</body>
</html>`;
}

/** Escape HTML entities */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
