import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOntarioSourcesFromOpenData,
  ontario511CatalogUrl,
} from './sources.js';

test('Ontario 511 catalog URL requires and encodes the server-side key', () => {
  assert.equal(ontario511CatalogUrl({}), '');
  const value = ontario511CatalogUrl({
    CCTV_ONTARIO_511_KEY: 'proof key',
  });
  const aliasValue = ontario511CatalogUrl({
    ONTARIO_511_API_KEY: 'friendly proof key',
  });
  const url = new URL(value);
  assert.equal(
    new URL(aliasValue).searchParams.get('key'),
    'friendly proof key',
  );
  const precedenceValue = ontario511CatalogUrl({
    ONTARIO_511_API_KEY: 'preferred key',
    CCTV_ONTARIO_511_KEY: 'legacy key',
  });
  assert.equal(
    new URL(precedenceValue).searchParams.get('key'),
    'preferred key',
  );
  assert.equal(url.origin, 'https://511on.ca');
  assert.equal(url.pathname, '/api/v2/get/cameras');
  assert.equal(url.searchParams.get('key'), 'proof key');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('lang'), 'en');
});

test('Ontario 511 makes no request when the developer key is absent', async () => {
  let calls = 0;
  const rows = await loadOntarioSourcesFromOpenData({
    env: {},
    fetchImpl: async () => {
      calls++;
      throw new Error('fetch should not run');
    },
  });
  assert.deepEqual(rows, []);
  assert.equal(calls, 0);
});

test('Ontario 511 uses the key only on the upstream catalog request', async () => {
  const calls = [];
  const rows = await loadOntarioSourcesFromOpenData({
    env: {
      CCTV_ONTARIO_511_KEY: 'server-secret',
      CCTV_ONTARIO_MAX_SOURCES: '20',
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json([
        {
          Id: 455,
          Roadway: 'Highway 407',
          Direction: 'Eastbound',
          Latitude: 43.992,
          Longitude: -78.6864,
          Location: 'Highway 407 East of Bethesda',
          Views: [
            {
              Id: 815,
              Url: 'https://511on.ca/map/Cctv/815',
              Status: 'Enabled',
              Description: '',
            },
          ],
        },
      ]);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'server-secret');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, 'Ontario 511');
  assert.equal(rows[0].snapshotUrl, 'https://511on.ca/map/Cctv/815');
  assert.doesNotMatch(JSON.stringify(rows[0]), /server-secret/);
});
