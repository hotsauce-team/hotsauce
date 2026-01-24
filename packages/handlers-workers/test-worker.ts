// Simple test Worker for executor tests
// Echoes back data for transform hooks, logs actions

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

  // Unknown type - still respond
  const response: WorkerResponse = {
    id,
    success: true,
    result: { type, payload },
  };
  self.postMessage(response);
};

console.log('[test-worker] loaded');
