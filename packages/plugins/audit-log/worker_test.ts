// Tests for the audit-log worker logic

import { assertEquals } from '@std/assert';
import { shouldAuditTable } from './worker.ts';
import type { AuditLogConfig } from './types.ts';

Deno.test('shouldAuditTable: audits all tables by default', () => {
  const config: AuditLogConfig = {};
  assertEquals(shouldAuditTable('users', config), true);
  assertEquals(shouldAuditTable('posts', config), true);
  assertEquals(shouldAuditTable('any_table', config), true);
});

Deno.test('shouldAuditTable: excludes tables in excludeTables', () => {
  const config: AuditLogConfig = {
    excludeTables: ['sessions', 'audit_logs'],
  };
  assertEquals(shouldAuditTable('users', config), true);
  assertEquals(shouldAuditTable('sessions', config), false);
  assertEquals(shouldAuditTable('audit_logs', config), false);
});

Deno.test('shouldAuditTable: only includes tables in includeTables', () => {
  const config: AuditLogConfig = {
    includeTables: ['users', 'posts'],
  };
  assertEquals(shouldAuditTable('users', config), true);
  assertEquals(shouldAuditTable('posts', config), true);
  assertEquals(shouldAuditTable('comments', config), false);
});

Deno.test('shouldAuditTable: excludeTables takes precedence over includeTables', () => {
  const config: AuditLogConfig = {
    includeTables: ['users', 'posts'],
    excludeTables: ['posts'],
  };
  assertEquals(shouldAuditTable('users', config), true);
  assertEquals(shouldAuditTable('posts', config), false);
});

// ─────────────────────────────────────────────────────────────
// Test Worker message handling via actual Worker
// ─────────────────────────────────────────────────────────────

interface WorkerRequest {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

function createTestWorker(): Worker {
  return new Worker(import.meta.resolve('./worker.ts'), { type: 'module' });
}

async function sendMessage(
  worker: Worker,
  type: string,
  payload: Record<string, unknown>,
): Promise<WorkerResponse> {
  const id = crypto.randomUUID();
  const request: WorkerRequest = { id, type, payload };

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler);
      reject(new Error('Worker message timeout'));
    }, 5000);

    const handler = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id === id) {
        clearTimeout(timeout);
        worker.removeEventListener('message', handler);
        resolve(event.data);
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage(request);
  });
}

Deno.test('Worker: initializes with config', async () => {
  const worker = createTestWorker();
  try {
    const response = await sendMessage(worker, 'init', {
      config: { excludeTables: ['sessions'] },
    });

    assertEquals(response.success, true);
    assertEquals(response.result, { success: true });
  } finally {
    worker.terminate();
  }
});

Deno.test('Worker: handles action messages', async () => {
  const worker = createTestWorker();
  try {
    // Initialize first
    await sendMessage(worker, 'init', { config: {} });

    // Send an action
    const response = await sendMessage(worker, 'action', {
      action: 'create',
      ctx: {
        table: 'users',
        action: 'create',
        recordId: '123',
        timestamp: new Date().toISOString(),
        newData: { name: 'Test User' },
      },
    });

    assertEquals(response.success, true);
    assertEquals(response.result, null); // Actions don't return data
  } finally {
    worker.terminate();
  }
});

Deno.test('Worker: handles transform:beforeSave (pass-through)', async () => {
  const worker = createTestWorker();
  try {
    await sendMessage(worker, 'init', { config: {} });

    const inputData = { name: 'Test', email: 'test@example.com' };
    const response = await sendMessage(worker, 'transform:beforeSave', {
      data: inputData,
    });

    assertEquals(response.success, true);
    assertEquals(response.result, inputData); // Data passed through unchanged
  } finally {
    worker.terminate();
  }
});

Deno.test('Worker: handles transform:afterRead (pass-through)', async () => {
  const worker = createTestWorker();
  try {
    await sendMessage(worker, 'init', { config: {} });

    const inputData = { id: 1, name: 'Test' };
    const response = await sendMessage(worker, 'transform:afterRead', {
      data: inputData,
    });

    assertEquals(response.success, true);
    assertEquals(response.result, inputData);
  } finally {
    worker.terminate();
  }
});

Deno.test('Worker: handles unknown message types gracefully', async () => {
  const worker = createTestWorker();
  try {
    const response = await sendMessage(worker, 'unknown-type', {});

    assertEquals(response.success, true);
    assertEquals(response.result, null);
  } finally {
    worker.terminate();
  }
});

// ─────────────────────────────────────────────────────────────
// Type tests
// ─────────────────────────────────────────────────────────────

import type { AuditEntry } from './types.ts';

Deno.test('AuditEntry: type accepts valid entries', () => {
  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action: 'create',
    table: 'users',
    recordId: '123',
    user: { sub: '1', role: 'admin' },
    newData: { name: 'Test' },
  };

  // Type-level test - if this compiles, the type is correct
  assertEquals(entry.action, 'create');
  assertEquals(entry.table, 'users');
});

Deno.test('AuditEntry: allows optional fields', () => {
  const minimal: AuditEntry = {
    timestamp: new Date().toISOString(),
    action: 'delete',
    table: 'posts',
  };

  assertEquals(minimal.recordId, undefined);
  assertEquals(minimal.user, undefined);
  assertEquals(minimal.oldData, undefined);
  assertEquals(minimal.newData, undefined);
});

Deno.test('AuditLogConfig: accepts all config options', () => {
  const config: AuditLogConfig = {
    webhookUrl: 'https://audit.example.com/events',
    includeTables: ['users', 'posts'],
    excludeTables: ['sessions'],
    logReads: true,
    logLists: false,
  };

  assertEquals(config.webhookUrl, 'https://audit.example.com/events');
  assertEquals(config.logReads, true);
});
