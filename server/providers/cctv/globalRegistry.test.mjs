import test from 'node:test';
import assert from 'node:assert/strict';
import { globalTrafficCameraCoverage } from './globalRegistry.js';
import { cctvProxy } from '../cctv.js';

test('coverage separates implemented international adapters from inventory and live media', () => {
  const result = globalTrafficCameraCoverage([
    { name: 'fintraffic', status: 'ready', count: 300, updatedAt: 123 },
  ]);
  assert.equal(result.countryCount, 7);
  assert.equal(result.networks.length, 30);
  assert.equal(result.usJurisdictions.length, 56);
  const finland = result.networks.find((x) => x.countryIso === 'FIN');
  assert.equal(finland.inventoryCount, 300);
  assert.equal(finland.mediaStatus, 'verify-per-camera');
  const ontario = result.networks.find((x) => x.id === 'ontario');
  assert.equal(ontario.access, 'key-required');
  assert.equal(ontario.requiredCredential, 'ONTARIO_511_API_KEY');
  assert.equal(ontario.inventoryStatus, 'not-queried');
  const alaska = result.networks.find((x) => x.id === 'alaska-511');
  assert.equal(alaska.access, 'key-required');
  assert.equal(alaska.requiredCredential, 'ALASKA_511_API_KEY');
  for (const id of [
    'connecticut-511',
    'florida-511',
    'pennsylvania-511',
    'new-england-511',
  ]) {
    const network = result.networks.find((row) => row.id === id);
    assert.equal(network.adapterVerification, 'contract-unverified');
    assert.equal(network.inventoryCount, 0);
    assert.equal(network.access, 'key-required');
  }
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

test('serverless CCTV advertises stateless HLS with snapshot capability', async () => {
  const prior = process.env.CCTV_SOURCES_JSON;
  process.env.CCTV_SOURCES_JSON = JSON.stringify([
    {
      id: 'proof-hls',
      feedType: 'hls',
      url: 'https://video.example/playlist.m3u8',
      snapshotUrl: 'https://image.example/frame.jpg',
    },
  ]);
  try {
    let middleware;
    cctvProxy({ statelessMedia: true }).configureServer({
      middlewares: {
        use(_path, handler) {
          middleware = handler;
        },
      },
    });
    const run = async (url) => {
      let code, payload;
      await middleware(
        { url, method: 'GET' },
        {
          writeHead(status) {
            code = status;
          },
          end(body) {
            payload = JSON.parse(body);
          },
        },
      );
      return { code, payload };
    };
    const catalog = await run('/sources');
    assert.equal(catalog.payload.sources[0].feedType, 'hls');
    assert.deepEqual(catalog.payload.sources[0].mediaCapabilities, {
      video: true,
      snapshot: true,
      locationOnly: false,
    });
    const stream = await run('/stream/proof-hls');
    assert.equal(stream.payload.mediaMode, 'stateless-streams-and-snapshots');
  } finally {
    if (prior === undefined) delete process.env.CCTV_SOURCES_JSON;
    else process.env.CCTV_SOURCES_JSON = prior;
  }
});
