import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
function worker({ online = false, status = 200 } = {}) {
  const handlers = {}, writes = [], precached = [], deleted = [];
  const fallback = { savedTripViewer: true };
  const scope = 'https://example.test/Leeway-Maps/';
  const caches = {
    open: async () => ({ addAll: async (urls) => precached.push(...urls), put: async (...args) => writes.push(args) }),
    match: async (request) => String(request?.url || request) === `${scope}offline.html` ? fallback : undefined,
    keys: async () => ['leeway-maps-offline-v2', 'leeway-logistics-offline-v4', 'another-app-cache'],
    delete: async (key) => deleted.push(key),
  };
  vm.runInNewContext(script, {
    URL, caches,
    self: { registration: { scope }, location: new URL(scope), clients: { claim: async () => {} }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async () => { if (!online) throw new Error('Network unavailable'); return { status, ok: status === 200, type: 'basic', clone: () => ({ status }) }; },
  });
  return {
    writes, precached, deleted, fallback, scope,
    async lifecycle(name) { let pending; handlers[name]({ waitUntil: (promise) => { pending = promise; } }); await pending; },
    async request(path, { mode = 'cors', method = 'GET' } = {}) {
      let response;
      const waits = [];
      handlers.fetch({ request: { url: new URL(path, scope).href, mode, method }, respondWith: (promise) => { response = promise; }, waitUntil: (promise) => waits.push(promise) });
      const result = await response;
      await Promise.all(waits);
      return result;
    },
  };
}

test('install precaches the complete standalone saved-trip viewer and upgrade only clears its own caches', async () => {
  const w = worker();
  await w.lifecycle('install');
  for (const file of ['offline.html', 'offlineTripCore.js', 'offlineTripPage.js', 'icon-192.png'])
    assert.ok(w.precached.includes(`${w.scope}${file}`));
  await w.lifecycle('activate');
  assert.deepEqual(w.deleted, ['leeway-maps-offline-v2']);
});

test('offline root, explicit index and shared-address launches open saved trip rather than an incomplete globe shell', async () => {
  const w = worker();
  for (const path of ['./', 'index.html', '?sharedText=Union%20Station%20Chicago'])
    assert.equal(await w.request(path, { mode: 'navigate' }), w.fallback);
});

test('online navigation remains online; provider outage can recover the saved trip', async () => {
  assert.equal((await worker({ online: true }).request('./', { mode: 'navigate' })).status, 200);
  const outage = worker({ online: true, status: 503 });
  assert.equal(await outage.request('./', { mode: 'navigate' }), outage.fallback);
});

test('private API JSON, cross-origin tiles, writes and out-of-scope pages are never intercepted or cached', async () => {
  const w = worker({ online: true });
  for (const path of ['api/drivers.json', '/api/private.json', 'https://tiles.example.test/0.png', '../other-app/assets/app.js'])
    assert.equal(await w.request(path), undefined);
  assert.equal(await w.request('assets/index.js', { method: 'POST' }), undefined);
  assert.equal(await w.request('../other-app/', { mode: 'navigate' }), undefined);
  assert.equal(w.writes.length, 0);
  assert.equal((await w.request('assets/index.js')).status, 200);
  assert.equal(w.writes.length, 1);
});
