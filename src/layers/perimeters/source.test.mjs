import test from 'node:test';
import assert from 'node:assert/strict';
import { createWfigsPerimeterSource } from './source.js';
import { normalizeFirePerimeterSnapshot } from './records.js';
import { firePerimetersProxy } from '../../../server/providers/firePerimeters.js';

const ring = [
  [-108.1, 35.2],
  [-108.0, 35.2],
  [-108.0, 35.3],
  [-108.1, 35.2],
];
const validPayload = {
  features: [
    {
      id: 1,
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { attr_UniqueFireIdentifier: '2026-NMGNF-000123' },
    },
  ],
};

test('a successful response yields normalized perimeter rows', async () => {
  let requested;
  const source = createWfigsPerimeterSource({
    fetchImpl: async (url) => {
      requested = String(url);
      return Response.json({
        rows: normalizeFirePerimeterSnapshot(validPayload),
      });
    },
  });
  const rows = await source.getSnapshot();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, '2026-NMGNF-000123');
  assert.equal(requested, '/api/fire-perimeters');
});

test('a truncated response pages until the feed is complete', async () => {
  const pageRing = (id) => ({
    id,
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { attr_UniqueFireIdentifier: `fire-${id}` },
  });
  const requests = [];
  let handler;
  const plugin = firePerimetersProxy({
    fetchImpl: async (url) => {
      requests.push(new URL(String(url)).searchParams.get('resultOffset'));
      const page = requests.length;
      return Response.json({
        features: [pageRing(page)],
        properties: { exceededTransferLimit: page < 3 },
      });
    },
  });
  plugin.configureServer({
    middlewares: {
      use: (_path, callback) => {
        handler = callback;
      },
    },
  });
  let payload;
  await handler(
    { url: '/', method: 'GET' },
    {
      writeHead(status) {
        assert.equal(status, 200);
      },
      end(body) {
        payload = JSON.parse(body);
      },
    },
  );
  const rows = payload.rows;
  assert.deepEqual(
    rows.map((row) => row.stableId),
    ['fire-1', 'fire-2', 'fire-3'],
  );
  assert.deepEqual(requests, [null, '1', '2']);
});

test('an upstream failure surfaces its HTTP status', async () => {
  const source = createWfigsPerimeterSource({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(source.getSnapshot(), /WFIGS HTTP 503/);
});

test('a malformed successful response is never accepted as an empty snapshot', async () => {
  for (const payload of [{}, { rows: null }, { rows: {} }]) {
    const source = createWfigsPerimeterSource({
      fetchImpl: async () => Response.json(payload),
    });
    await assert.rejects(source.getSnapshot(), /Malformed perimeter snapshot/);
  }
});

test('response-body completion honors cancellation without replacing records', async () => {
  const abort = new AbortController();
  const source = createWfigsPerimeterSource({
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers(),
      text: async () => {
        abort.abort();
        return JSON.stringify({
          rows: normalizeFirePerimeterSnapshot(validPayload),
        });
      },
    }),
  });
  await assert.rejects(source.getSnapshot({ signal: abort.signal }), {
    name: 'AbortError',
  });
});

test('Pages WFIGS pages directly, preserves observation time and normalizes only a complete snapshot', async () => {
  const calls = [];
  const source = createWfigsPerimeterSource({
    publicWfigs: true,
    fetchImpl: async (url, options) => {
      calls.push(new URL(url));
      assert.equal(options.redirect, 'error');
      const n = calls.length;
      return Response.json({
        features: [
          {
            ...validPayload.features[0],
            id: n,
            properties: {
              attr_UniqueFireIdentifier: `fire-${n}`,
              poly_DateCurrent: 1234567890000,
            },
          },
        ],
        properties: { exceededTransferLimit: n < 2 },
      });
    },
  });
  const rows = await source.getSnapshot();
  assert.deepEqual(
    rows.map((row) => row.stableId),
    ['fire-1', 'fire-2'],
  );
  assert.equal(rows[0].updatedTime, 1234567890000);
  assert.equal(calls[0].hostname, 'services3.arcgis.com');
  assert.deepEqual(
    calls.map((url) => url.searchParams.get('resultOffset')),
    ['0', '1'],
  );
  assert.equal(calls[0].searchParams.get('orderByFields'), 'OBJECTID ASC');
  assert.equal(calls[0].searchParams.get('resultRecordCount'), '2000');
});

test('Pages never promotes a truncated or stalled feed into a fresh complete snapshot', async () => {
  for (const empty of [false, true]) {
    let count = 0;
    const source = createWfigsPerimeterSource({
      publicWfigs: true,
      fetchImpl: async () => {
        count++;
        return Response.json({
          features: empty ? [] : validPayload.features,
          exceededTransferLimit: true,
        });
      },
    });
    await assert.rejects(source.getSnapshot(), /Incomplete WFIGS/);
    assert.equal(count, empty ? 1 : 5);
  }
});

test('Pages bounds metadata bytes, reports provider errors and honors abort deadlines', async () => {
  for (const response of [
    () => new Response('unavailable', { status: 503 }),
    () => Response.json({ error: { message: 'Service unavailable' } }),
    () =>
      new Response('{}', {
        headers: { 'content-length': String(16 * 1024 * 1024 + 1) },
      }),
  ]) {
    const source = createWfigsPerimeterSource({
      publicWfigs: true,
      fetchImpl: async () => response(),
    });
    await assert.rejects(source.getSnapshot());
  }
  let requests = 0;
  const source = createWfigsPerimeterSource({
    publicWfigs: true,
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => {
      requests++;
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  });
  await assert.rejects(source.getSnapshot({ signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  assert.equal(requests, 0);
  await assert.rejects(source.getSnapshot(), /timed out/);
  assert.equal(requests, 1);
});
