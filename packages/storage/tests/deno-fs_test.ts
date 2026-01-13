// Tests for Deno filesystem storage

import { assertEquals, assertExists } from 'jsr:@std/assert';
import {
  createLocalUploads,
  createLocalStorage,
  createStaticHandler,
} from '../deno-fs.ts';
import { getContentType } from '../utils.ts';

// Use a test directory within packages (covered by read/write permissions)
const TEST_DIR = './packages/storage/tests/.test-uploads';

// Setup: create test directory
try {
  await Deno.mkdir(TEST_DIR, { recursive: true });
} catch {
  // Ignore if exists
}

// Cleanup helper
async function cleanupTestDir() {
  try {
    for await (const entry of Deno.readDir(TEST_DIR)) {
      await Deno.remove(`${TEST_DIR}/${entry.name}`, { recursive: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// getContentType tests
// =============================================================================

Deno.test('getContentType: returns correct MIME types', () => {
  assertEquals(getContentType('photo.jpg'), 'image/jpeg');
  assertEquals(getContentType('photo.jpeg'), 'image/jpeg');
  assertEquals(getContentType('image.png'), 'image/png');
  assertEquals(getContentType('animation.gif'), 'image/gif');
  assertEquals(getContentType('photo.webp'), 'image/webp');
  assertEquals(getContentType('icon.svg'), 'image/svg+xml');
});

Deno.test('getContentType: handles documents', () => {
  assertEquals(getContentType('document.pdf'), 'application/pdf');
  assertEquals(getContentType('report.doc'), 'application/msword');
  assertEquals(getContentType('data.json'), 'application/json');
});

Deno.test('getContentType: handles text files', () => {
  assertEquals(getContentType('readme.txt'), 'text/plain');
  assertEquals(getContentType('page.html'), 'text/html');
  assertEquals(getContentType('styles.css'), 'text/css');
  assertEquals(getContentType('script.js'), 'text/javascript');
});

Deno.test('getContentType: returns octet-stream for unknown', () => {
  assertEquals(getContentType('file.xyz'), 'application/octet-stream');
  assertEquals(getContentType('noextension'), 'application/octet-stream');
});

// =============================================================================
// createLocalStorage tests
// =============================================================================

Deno.test('createLocalStorage: store creates file and returns metadata', async () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  const content = 'Hello, World!';
  const file = new File([content], 'test.txt', { type: 'text/plain' });
  
  const result = await storage.store(file);
  
  assertEquals(result.filename, 'test.txt');
  assertEquals(result.mimeType, 'text/plain');
  assertEquals(result.size, content.length);
  assertEquals(result.url.startsWith('/uploads/'), true);
  assertExists(result.path);
  
  // Verify file exists
  assertEquals(await storage.exists(result.path), true);
});

Deno.test('createLocalStorage: store with subdirectory', async () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  const file = new File(['test'], 'image.png', { type: 'image/png' });
  
  const result = await storage.store(file, { directory: 'images' });
  
  assertEquals(result.path.startsWith('images/'), true);
  assertEquals(result.url.startsWith('/uploads/images/'), true);
});

Deno.test('createLocalStorage: delete removes file', async () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  const file = new File(['delete me'], 'deleteme.txt', { type: 'text/plain' });
  const result = await storage.store(file);
  
  // File exists
  assertEquals(await storage.exists(result.path), true);
  
  // Delete it
  await storage.delete(result.path);
  
  // File no longer exists
  assertEquals(await storage.exists(result.path), false);
});

Deno.test('createLocalStorage: delete non-existent file does not throw', async () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  // Should not throw
  await storage.delete('nonexistent.txt');
});

Deno.test('createLocalStorage: exists returns false for missing file', async () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  assertEquals(await storage.exists('does-not-exist.txt'), false);
});

Deno.test('createLocalStorage: getUrl returns correct URL', () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  assertEquals(storage.getUrl('image.png'), '/uploads/image.png');
  assertEquals(storage.getUrl('images/photo.jpg'), '/uploads/images/photo.jpg');
});

Deno.test('createLocalStorage: getUrl sanitizes path', () => {
  const storage = createLocalStorage({
    directory: TEST_DIR,
    baseUrl: '/uploads',
  });
  
  // Directory traversal should be sanitized
  assertEquals(storage.getUrl('../../../etc/passwd'), '/uploads/etc/passwd');
});

// =============================================================================
// createStaticHandler tests
// =============================================================================

Deno.test('createStaticHandler: returns null for non-matching path', async () => {
  const handler = createStaticHandler({
    directory: TEST_DIR,
    urlPrefix: '/uploads',
  });
  
  const request = new Request('http://localhost/other/path');
  const response = await handler(request);
  
  assertEquals(response, null);
});

Deno.test('createStaticHandler: returns null for non-existent file', async () => {
  const handler = createStaticHandler({
    directory: TEST_DIR,
    urlPrefix: '/uploads',
  });
  
  const request = new Request('http://localhost/uploads/nonexistent.txt');
  const response = await handler(request);
  
  assertEquals(response, null);
});

Deno.test('createStaticHandler: serves existing file', async () => {
  // Create a test file
  const testFilePath = `${TEST_DIR}/serve-test.txt`;
  const content = 'Static file content';
  await Deno.writeTextFile(testFilePath, content);
  
  const handler = createStaticHandler({
    directory: TEST_DIR,
    urlPrefix: '/uploads',
  });
  
  const request = new Request('http://localhost/uploads/serve-test.txt');
  const response = await handler(request);
  
  assertExists(response);
  assertEquals(response!.status, 200);
  assertEquals(response!.headers.get('Content-Type'), 'text/plain');
  assertEquals(await response!.text(), content);
});

Deno.test('createStaticHandler: sets correct content type', async () => {
  // Create a test file
  const testFilePath = `${TEST_DIR}/test.json`;
  await Deno.writeTextFile(testFilePath, '{"test": true}');
  
  const handler = createStaticHandler({
    directory: TEST_DIR,
    urlPrefix: '/uploads',
  });
  
  const request = new Request('http://localhost/uploads/test.json');
  const response = await handler(request);
  
  assertExists(response);
  assertEquals(response!.headers.get('Content-Type'), 'application/json');
  // Consume body to close file handle
  await response!.text();
});

// =============================================================================
// createLocalUploads integration tests
// =============================================================================

Deno.test('createLocalUploads: returns storage and handler', () => {
  const uploads = createLocalUploads({
    directory: TEST_DIR,
    urlPrefix: '/uploads',
  });
  
  assertExists(uploads.storage);
  assertExists(uploads.handler);
  assertEquals(typeof uploads.storage.store, 'function');
  assertEquals(typeof uploads.handler, 'function');
});

Deno.test('createLocalUploads: storage and handler work together', async () => {
  const uploads = createLocalUploads({
    directory: TEST_DIR,
    urlPrefix: '/files',
  });
  
  // Store a file
  const file = new File(['integration test'], 'integration.txt', { type: 'text/plain' });
  const stored = await uploads.storage.store(file);
  
  // Serve the file
  const request = new Request(`http://localhost${stored.url}`);
  const response = await uploads.handler(request);
  
  assertExists(response);
  assertEquals(response!.status, 200);
  assertEquals(await response!.text(), 'integration test');
});
