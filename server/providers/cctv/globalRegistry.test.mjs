import test from 'node:test';
import assert from 'node:assert/strict';
import { globalTrafficCameraCoverage } from './globalRegistry.js';
import { cctvProxy } from '../cctv.js';

test('coverage separates implemented international adapters from inventory and live media', () => {
  const result = globalTrafficCameraCoverage([
    { name: 'fintraffic', status: 'ready', count: 300, updatedAt: 123 },
  ]);
  assert.equal(result.countryCount, 7);
  assert.equal(result.networks.length, 19);
  assert.equal(result.usJurisdictions.length, 56);
  const finland = result.networks.find((x) => x.countryIso === 'FIN');
  assert.equal(finland.inventoryCount, 300);
  assert.equal(finland.mediaStatus, 'verify-per-camera');
  const ontario = result.networks.find((x) => x.id === 'ontario');
  assert.equal(ontario.access, 'key-required');
  assert.equal(ontario.inventoryStatus, 'not-queried');
});

test('cold coverage, health and jurisdiction routes answer without any upstream requests', async () => {
  const before = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    throw new Error('No external request expected');
  };
  try {
    let middleware;
    cctvProxy().configureServer({
      middlewares: {
        use(_path, handler) {
          middleware = handler;
        },
      },
    });
    for (const url of ['/coverage', '/jurisdictions', '/health']) {
      let code;
      let payload;
      await middleware(
        { url },
        {
          writeHead(status) {
            code = status;
          },
          end(body) {
            payload = JSON.parse(body);
          },
        },
      );
      assert.equal(code, 200);
      assert.ok(payload);
    }
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = before;
  }
});
