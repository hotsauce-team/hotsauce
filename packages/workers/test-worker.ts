// deno-lint-ignore-file no-console
// Simple test Worker for executor tests
// Echoes back data for transform hooks, logs actions

// Minimal Worker globals declaration
// deno-lint-ignore no-explicit-any
declare const self: { onmessage: any; postMessage: (msg: any) => void };

interface WorkerRequest {
  id: string;
  type: string;
  payload: {
    ctx?: unknown;
    data?: Record<string, unknown>;
    delay?: number;
    fail?: boolean;
    failMessage?: string;
    [key: string]: unknown;
  };
}

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  // Handle init
  if (type === 'init') {
    const response: WorkerResponse = { id, success: true };
    self.postMessage(response);
    return;
  }

  // Optional delay to simulate async work
  const delay = payload.data?.delay as number | undefined;
  if (delay && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Check if we should fail
  const shouldFail = payload.data?.fail as boolean | undefined;
  const failMessage = payload.data?.failMessage as string | undefined;
  if (shouldFail) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: failMessage ?? 'Intentional failure',
    };
    self.postMessage(response);
    return;
  }

  // For transform hooks, return the data unchanged (echo behavior)
  if (type === 'transform:beforeSave' || type === 'transform:afterRead') {
    const response: WorkerResponse = {
      id,
      success: true,
      result: payload.data, // Return data as-is
    };
    self.postMessage(response);
    return;
  }

  // For action hooks, just acknowledge
  if (type === 'action') {
    const response: WorkerResponse = {
      id,
      success: true,
      result: null,
    };
    self.postMessage(response);
    return;
  }

  // For ui:resolveFlashes, append a marker flash so tests can verify
  // round-trip semantics.
  if (type === 'ui:resolveFlashes') {
    const ctx = payload as unknown as {
      flashes: Array<{ type: string; message: string }>;
      action: string;
      table?: string;
    };
    const marker = ctx.table
      ? `worker-flash:${ctx.action}:${ctx.table}`
      : `worker-flash:${ctx.action}`;
    const result = [
      ...ctx.flashes,
      { type: 'info', message: marker },
    ];
    const response: WorkerResponse = { id, success: true, result };
    self.postMessage(response);
    return;
  }

  // For route renders, return HTML based on context
  if (type === 'route:render') {
    const renderType = payload.renderType as string;
    const context = payload.context as {
      table?: string;
      recordId?: string;
      column?: string;
      record?: Record<string, unknown>;
      value?: unknown;
    };

    // Special render type to test invalid response handling
    if (renderType === 'invalid-response') {
      const response: WorkerResponse = {
        id,
        success: true,
        result: { notHtml: 'this is wrong format' }, // Missing 'html' key
      };
      self.postMessage(response);
      return;
    }

    // Generate simple HTML response
    const html = `<!DOCTYPE html>
<html>
<head><title>Worker Render: ${renderType}</title></head>
<body>
  <h1>Rendered by Worker</h1>
  <p>Render Type: ${renderType}</p>
  <p>Table: ${context.table ?? 'none'}</p>
  <p>Record ID: ${context.recordId ?? 'none'}</p>
  <p>Column: ${context.column ?? 'none'}</p>
  <pre>${JSON.stringify(context.record ?? {}, null, 2)}</pre>
</body>
</html>`;

    const response: WorkerResponse = {
      id,
      success: true,
      result: { html },
    };
    self.postMessage(response);
    return;
  }

  // Unknown type - still respond
  const response: WorkerResponse = {
    id,
    success: true,
    result: { type, payload },
  };
  self.postMessage(response);
};

console.log('[test-worker] loaded');
