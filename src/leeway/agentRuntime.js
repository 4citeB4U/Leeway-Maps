export function runtimeBase(value) {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Use an HTTP(S) runtime URL without credentials, query, or fragment.',
    );
  if (
    globalThis.location?.protocol === 'https:' &&
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('An HTTPS app requires an HTTPS remote runtime.');
  return url.href.replace(/\/$/, '');
}

export async function discoverModels({
  endpoint,
  model,
  fetchImpl = fetch,
  signal = AbortSignal.timeout(10000),
}) {
  const response = await fetchImpl(`${runtimeBase(endpoint)}/api/tags`, {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Model inventory HTTP ${response.status}`);
  const body = await response.json();
  const models = (Array.isArray(body.models) ? body.models : [])
    .map((row) => String(row.name || row.model || ''))
    .filter(Boolean);
  return {
    reachable: true,
    modelInstalled: models.includes(model),
    models,
    scope: 'configured-runtime',
  };
}

// The runtime owns complete model files and reuses them. No phone-wide filesystem access.
export async function prepareModel({
  endpoint,
  model,
  onProgress = () => {},
  signal,
  fetchImpl = fetch,
}) {
  const inventory = await discoverModels({
    endpoint,
    model,
    fetchImpl,
    signal,
  });
  if (inventory.modelInstalled) return { ...inventory, reused: true };
  const response = await fetchImpl(`${runtimeBase(endpoint)}/api/pull`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!response.ok || !response.body)
    throw new Error(`Model download HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const consume = (line) => {
    if (!line.trim()) return;
    const row = JSON.parse(line);
    if (row.error) throw new Error(row.error);
    onProgress({
      status: String(row.status || 'Downloading'),
      completed: Number(row.completed) || 0,
      total: Number(row.total) || 0,
    });
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop();
      lines.forEach(consume);
      if (done) break;
      if (pending.length > 65536)
        throw new Error('Invalid download progress response');
    }
    consume(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const verified = await discoverModels({ endpoint, model, fetchImpl, signal });
  if (!verified.modelInstalled)
    throw new Error('Download ended but the runtime does not list this model.');
  return { ...verified, reused: false };
}
