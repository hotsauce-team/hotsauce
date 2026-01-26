// Tests for HTML sanitizer (XSS prevention)
import { assertEquals } from '@std/assert';
import { sanitizeHtml } from './sanitize.ts';
import { parseMarkdown } from './markdown.ts';

// ============================================================================
// XSS Attack Prevention
// ============================================================================

Deno.test('sanitize: removes script tags', () => {
  const input = 'Hello <script>alert(1)</script> world';
  const output = sanitizeHtml(input);
  assertEquals(output, 'Hello alert(1) world');
});

Deno.test('sanitize: removes script tags with attributes', () => {
  const input = '<script src="evil.js"></script>';
  const output = sanitizeHtml(input);
  assertEquals(output, '');
});

Deno.test('sanitize: removes iframe tags', () => {
  const input = '<iframe src="evil.com"></iframe>content';
  const output = sanitizeHtml(input);
  assertEquals(output, 'content');
});

Deno.test('sanitize: removes svg tags', () => {
  const input = '<svg onload="alert(1)"><circle /></svg>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<svg'), false);
});

Deno.test('sanitize: removes style tags', () => {
  const input = '<style>body { display: none }</style>text';
  const output = sanitizeHtml(input);
  assertEquals(output, 'body { display: none }text');
});

Deno.test('sanitize: removes object/embed tags', () => {
  const input = '<object data="evil.swf"></object><embed src="evil.swf">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<object'), false);
  assertEquals(output.includes('<embed'), false);
});

// ============================================================================
// Event Handler Prevention
// ============================================================================

Deno.test('sanitize: strips onclick', () => {
  const input = '<div onclick="alert(1)">click</div>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<div>click</div>');
});

Deno.test('sanitize: strips onerror from img', () => {
  const input = '<img src="x" onerror="alert(1)">';
  const output = sanitizeHtml(input);
  assertEquals(output, '<img src="x" />');
});

Deno.test('sanitize: strips onmouseover', () => {
  const input = '<a href="#" onmouseover="alert(1)">hover</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="#">hover</a>');
});

Deno.test('sanitize: strips onload', () => {
  const input = '<body onload="alert(1)">content</body>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('onload'), false);
});

// ============================================================================
// Dangerous URL Protocol Prevention
// ============================================================================

Deno.test('sanitize: blocks javascript: in href', () => {
  const input = '<a href="javascript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a>click</a>');
});

Deno.test('sanitize: blocks javascript: in src', () => {
  const input = '<img src="javascript:alert(1)">';
  const output = sanitizeHtml(input);
  assertEquals(output, '<img />');
});

Deno.test('sanitize: blocks data: URLs', () => {
  const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('href="data:'), false);
});

Deno.test('sanitize: blocks vbscript:', () => {
  const input = '<a href="vbscript:msgbox(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('vbscript'), false);
});

Deno.test('sanitize: allows https: URLs', () => {
  const input = '<a href="https://example.com">link</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="https://example.com">link</a>');
});

Deno.test('sanitize: allows http: URLs', () => {
  const input = '<a href="http://example.com">link</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="http://example.com">link</a>');
});

Deno.test('sanitize: allows mailto: URLs', () => {
  const input = '<a href="mailto:test@example.com">email</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="mailto:test@example.com">email</a>');
});

Deno.test('sanitize: allows relative URLs', () => {
  const input = '<a href="/page/about">about</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="/page/about">about</a>');
});

Deno.test('sanitize: allows hash URLs', () => {
  const input = '<a href="#section">jump</a>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<a href="#section">jump</a>');
});

// ============================================================================
// Allowed Elements Preserved
// ============================================================================

Deno.test('sanitize: preserves p tags', () => {
  const input = '<p>paragraph</p>';
  assertEquals(sanitizeHtml(input), '<p>paragraph</p>');
});

Deno.test('sanitize: preserves strong/em', () => {
  const input = '<strong>bold</strong> and <em>italic</em>';
  assertEquals(
    sanitizeHtml(input),
    '<strong>bold</strong> and <em>italic</em>',
  );
});

Deno.test('sanitize: preserves headings', () => {
  const input = '<h1>Title</h1><h2>Subtitle</h2>';
  assertEquals(sanitizeHtml(input), '<h1>Title</h1><h2>Subtitle</h2>');
});

Deno.test('sanitize: preserves lists', () => {
  const input = '<ul><li>one</li><li>two</li></ul>';
  assertEquals(sanitizeHtml(input), '<ul><li>one</li><li>two</li></ul>');
});

Deno.test('sanitize: preserves blockquote', () => {
  const input = '<blockquote>quoted text</blockquote>';
  assertEquals(sanitizeHtml(input), '<blockquote>quoted text</blockquote>');
});

Deno.test('sanitize: preserves code blocks', () => {
  const input = '<pre class="code js"><code>let x = 1;</code></pre>';
  assertEquals(
    sanitizeHtml(input),
    '<pre class="code js"><code>let x = 1;</code></pre>',
  );
});

Deno.test('sanitize: preserves img with safe src', () => {
  const input = '<img src="/images/photo.jpg" alt="A photo">';
  assertEquals(
    sanitizeHtml(input),
    '<img src="/images/photo.jpg" alt="A photo" />',
  );
});

Deno.test('sanitize: preserves a with safe href', () => {
  const input = '<a href="https://example.com" title="Example">link</a>';
  assertEquals(
    sanitizeHtml(input),
    '<a href="https://example.com" title="Example">link</a>',
  );
});

// ============================================================================
// Attribute Filtering
// ============================================================================

Deno.test('sanitize: strips unknown attributes', () => {
  const input = '<p class="foo" data-id="123" style="color:red">text</p>';
  assertEquals(sanitizeHtml(input), '<p>text</p>');
});

Deno.test('sanitize: preserves class on code/pre only', () => {
  const input = '<code class="language-js">code</code>';
  assertEquals(sanitizeHtml(input), '<code class="language-js">code</code>');
});

Deno.test('sanitize: strips class from p', () => {
  const input = '<p class="highlight">text</p>';
  assertEquals(sanitizeHtml(input), '<p>text</p>');
});

// ============================================================================
// HTML Comments
// ============================================================================

Deno.test('sanitize: removes HTML comments', () => {
  const input = '<!-- secret -->visible<!-- hidden -->';
  assertEquals(sanitizeHtml(input), 'visible');
});

Deno.test('sanitize: removes IE conditional comments', () => {
  const input = '<!--[if IE]><script>alert(1)</script><![endif]-->text';
  assertEquals(sanitizeHtml(input), 'text');
});

// ============================================================================
// Case Obfuscation Attacks (OWASP/DOMPurify)
// ============================================================================

Deno.test('sanitize: blocks JaVaScRiPt: case obfuscation', () => {
  const input = '<a href="JaVaScRiPt:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('javascript'), false);
  assertEquals(output.includes('JaVaScRiPt'), false);
});

Deno.test('sanitize: blocks JAVASCRIPT: uppercase', () => {
  const input = '<a href="JAVASCRIPT:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('href='), false);
});

Deno.test('sanitize: blocks VbScRiPt: mixed case', () => {
  const input = '<a href="VbScRiPt:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('VbScRiPt'), false);
});

// ============================================================================
// HTML Entity Encoded Protocol Attacks (OWASP)
// ============================================================================

Deno.test('sanitize: blocks &#106;avascript: decimal entities', () => {
  // &#106; = 'j', full string = "javascript:"
  const input = '<a href="&#106;avascript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  // Should not contain href with any javascript variant
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: blocks &#x6A;avascript: hex entities', () => {
  // &#x6A; = 'j'
  const input = '<a href="&#x6A;avascript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: blocks full entity-encoded javascript:', () => {
  // Fully encoded "javascript:alert('XSS')"
  const input =
    '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('href='), false);
});

// ============================================================================
// Whitespace/Control Character Attacks (DOMPurify)
// ============================================================================

Deno.test('sanitize: blocks javascript: with tab', () => {
  const input = '<a href="java\tscript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: blocks javascript: with newline', () => {
  const input = '<a href="java\nscript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: blocks javascript: with carriage return', () => {
  const input = '<a href="java\rscript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: blocks javascript: with encoded tab &#9;', () => {
  const input = '<a href="java&#9;script:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('href='), false);
});

Deno.test('sanitize: blocks javascript: with encoded newline &#10;', () => {
  const input = '<a href="java&#10;script:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('href='), false);
});

Deno.test('sanitize: blocks leading spaces before javascript:', () => {
  const input = '<a href="   javascript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

// ============================================================================
// Data URL Attacks (DOMPurify/OWASP)
// ============================================================================

Deno.test('sanitize: blocks data:text/html base64', () => {
  // Base64 encoded <script>alert('XSS')</script>
  const input =
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgnWFNTJyk8L3NjcmlwdD4=">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('data:'), false);
});

Deno.test('sanitize: blocks DATA: uppercase', () => {
  const input = '<a href="DATA:text/html,<script>alert(1)</script>">click</a>';
  const output = sanitizeHtml(input);
  // Should not contain DATA: URL - either href removed or empty
  // The dangerous content should be blocked
  assertEquals(output.includes('DATA:'), false);
  assertEquals(output.includes('data:'), false);
});

Deno.test('sanitize: blocks data: in img src', () => {
  const input = '<img src="data:image/svg+xml,<svg onload=alert(1)>">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('data:'), false);
});

// ============================================================================
// Malformed Tag Attacks (OWASP)
// ============================================================================

Deno.test('sanitize: blocks entity-encoded opening tags', () => {
  // &#x69; = 'i', so <scr&#x69;pt> would be <script> if decoded
  // The tag should be removed, but the content 'alert(1)' is preserved
  const input = '<scr&#x69;pt>alert(1)</script>';
  const output = sanitizeHtml(input);
  // The malformed tag should be stripped, leaving just the text content
  assertEquals(output.includes('<scr'), false);
  assertEquals(output.includes('<script'), false);
  assertEquals(output.includes('&#x69;'), false);
  // Content is preserved when tags are removed
  assertEquals(output.includes('alert(1)'), true);
});

Deno.test('sanitize: handles malformed img tag', () => {
  const input = '<IMG """><SCRIPT>alert("XSS")</SCRIPT>">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<SCRIPT'), false);
  assertEquals(output.includes('<script'), false);
});

Deno.test('sanitize: handles double brackets', () => {
  const input = '<<SCRIPT>alert("XSS");//<</SCRIPT>';
  const output = sanitizeHtml(input);
  // Script tags should be removed
  assertEquals(output.includes('<SCRIPT'), false);
  assertEquals(output.includes('<script'), false);
  // Note: the text content "alert" may remain, but the script tag is gone
});

Deno.test('sanitize: handles tag with slash before attribute', () => {
  const input = '<SCRIPT/SRC="http://evil.com/xss.js"></SCRIPT>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<SCRIPT'), false);
});

// ============================================================================
// Event Handler Obfuscation (DOMPurify/OWASP)
// ============================================================================

Deno.test('sanitize: strips ONCLICK uppercase', () => {
  const input = '<div ONCLICK="alert(1)">click</div>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<div>click</div>');
});

Deno.test('sanitize: strips OnClick mixed case', () => {
  const input = '<div OnClick="alert(1)">click</div>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<div>click</div>');
});

Deno.test('sanitize: strips onfocus', () => {
  const input = '<input onfocus="alert(1)" autofocus>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('onfocus'), false);
});

Deno.test('sanitize: strips onanimationend', () => {
  const input = '<div onanimationend="alert(1)">x</div>';
  const output = sanitizeHtml(input);
  assertEquals(output, '<div>x</div>');
});

// ============================================================================
// Rare Protocol Attacks
// ============================================================================

Deno.test('sanitize: blocks file: protocol', () => {
  const input = '<a href="file:///etc/passwd">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('file:'), false);
});

Deno.test('sanitize: blocks ftp: protocol', () => {
  const input = '<a href="ftp://evil.com/malware.exe">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('ftp:'), false);
});

// ============================================================================
// Additional Dangerous Elements (DOMPurify)
// ============================================================================

Deno.test('sanitize: removes form tags', () => {
  const input = '<form action="http://evil.com"><input></form>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<form'), false);
});

Deno.test('sanitize: removes button with formaction', () => {
  const input = '<button formaction="javascript:alert(1)">click</button>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<button'), false);
});

Deno.test('sanitize: removes base tag', () => {
  const input = '<base href="javascript:alert(1)//">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<base'), false);
});

Deno.test('sanitize: removes meta refresh', () => {
  const input =
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<meta'), false);
});

Deno.test('sanitize: removes link tag', () => {
  const input = '<link rel="stylesheet" href="javascript:alert(1)">';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<link'), false);
});

Deno.test('sanitize: removes math tags', () => {
  const input =
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<math'), false);
  assertEquals(output.includes('onerror'), false);
});

Deno.test('sanitize: removes noscript', () => {
  const input = '<noscript><img src=x onerror=alert(1)></noscript>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<noscript'), false);
});

Deno.test('sanitize: removes template tag', () => {
  const input = '<template><script>alert(1)</script></template>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('<template'), false);
});

// ============================================================================
// Unicode Attack Vectors (DOMPurify)
// ============================================================================

Deno.test('sanitize: blocks javascript with zero-width space', () => {
  // \u200B = zero-width space
  const input = '<a href="java\u200Bscript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  // The URL validation should catch this
  assertEquals(output.includes('alert'), false);
});

Deno.test('sanitize: handles Unicode replacement char in protocol', () => {
  const input = '<a href="\uFFFDjavascript:alert(1)">click</a>';
  const output = sanitizeHtml(input);
  assertEquals(output.includes('alert'), false);
});

// ============================================================================
// Integration with Markdown Parser
// ============================================================================

Deno.test('sanitize: markdown with script injection', () => {
  const md = 'Hello <script>alert(1)</script> world';
  const html = parseMarkdown(md);
  const safe = sanitizeHtml(html);
  assertEquals(safe.includes('<script'), false);
});

Deno.test('sanitize: markdown javascript link', () => {
  const md = '[click](javascript:alert(1))';
  const html = parseMarkdown(md);
  const safe = sanitizeHtml(html);
  assertEquals(safe.includes('javascript:'), false);
});

Deno.test('sanitize: markdown normal formatting preserved', () => {
  const md = '**bold** and *italic* and `code`';
  const html = parseMarkdown(md);
  const safe = sanitizeHtml(html);
  assertEquals(safe.includes('<strong>bold</strong>'), true);
  assertEquals(safe.includes('<em>italic</em>'), true);
  assertEquals(safe.includes('<code>code</code>'), true);
});

Deno.test('sanitize: markdown links preserved', () => {
  const md = '[Example](https://example.com)';
  const html = parseMarkdown(md);
  const safe = sanitizeHtml(html);
  assertEquals(safe.includes('href="https://example.com"'), true);
});
