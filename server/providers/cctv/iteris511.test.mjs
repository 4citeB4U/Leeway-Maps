import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keyed511CatalogUrl,
  loadGeorgia511Sources,
  loadNewYork511Sources,
} from './iteris511.js';
import {
  GEORGIA_511_CAMERAS_URL,
  NEWYORK_511_CAMERAS_URL,
} from './constants.js';

test('keyed 511 URL is empty without a key and encodes the key', () => {
  assert.equal(keyed511CatalogUrl(NEWYORK_511_CAMERAS_URL, ''), '');
  const url = new URL(keyed511CatalogUrl(NEWYORK_511_CAMERAS_URL, 'proof key'));
  assert.equal(url.origin, 'https://511ny.org');
  assert.equal(url.pathname, '/api/v2/get/cameras');
  assert.equal(url.searchParams.get('key'), 'proof key');
  assert.equal(url.searchParams.get('format'), 'json');
});

test('New York 511 makes no request without a developer key', async () => {
  let calls = 0;
  const rows = await loadNewYork511Sources({
    env: {},
    fetchImpl: async () => {
      calls++;
      throw new Error('fetch should not run');
    },
  });
  assert.deepEqual(rows, []);
  assert.equal(calls, 0);
});

test('Georgia makes no request without a key and fetch errors never log keys', async () => {
  const before = console.warn;
  const messages = [];
  console.warn = (...args) => messages.push(args.join(' '));
  try {
    let calls = 0;
    assert.deepEqual(
      await loadGeorgia511Sources({
        env: {},
        fetchImpl: async () => {
          calls++;
        },
      }),
      [],
    );
    assert.equal(calls, 0);
    await loadGeorgia511Sources({
      env: { GEORGIA_511_API_KEY: 'test-secret' },
      fetchImpl: async () => {
        throw new Error('request https://511ga.org/?key=test-secret');
      },
    });
    assert.doesNotMatch(messages.join(' '), /test-secret/);
  } finally {
    console.warn = before;
  }
});
test('New York 511 pins frames to the official view-id origin', async () => {
  const calls = [];
  const rows = await loadNewYork511Sources({
    env: { NEWYORK_511_API_KEY: 'ny-secret' },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json([
        {
          Id: 17,
          Roadway: 'I-90',
          Direction: 'Eastbound',
          Latitude: 42.9,
          Longitude: -78.8,
          Location: 'Buffalo proof camera',
          Views: [
            {
              Id: 881,
              Url: 'https://evil.example/ignored.jpg',
              Status: 'Enabled',
            },
          ],
        },
      ]);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'ny-secret');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'ny511-881');
  assert.equal(rows[0].snapshotUrl, 'https://511ny.org/map/Cctv/881');
  assert.equal(
    rows[0].provider,
    'New York State Department of Transportation / 511NY',
  );
  assert.doesNotMatch(JSON.stringify(rows[0]), /ny-secret|evil\.example/);
});
test('Georgia 511 uses the preferred key and official image origin', async () => {
  const calls = [];
  const rows = await loadGeorgia511Sources({
    env: {
      GEORGIA_511_API_KEY: 'preferred-ga',
      CCTV_GEORGIA_511_KEY: 'legacy-ga',
    },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json([
        {
          Id: 44,
          Roadway: 'I-75',
          Direction: 'Northbound',
          Latitude: 33.75,
          Longitude: -84.39,
          Location: 'Atlanta proof camera',
          Views: [{ Id: 920, Url: 'http://invalid.test', Status: 'Enabled' }],
        },
      ]);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).origin, 'https://511ga.org');
  assert.equal(new URL(calls[0]).pathname, '/api/v2/get/cameras');
  assert.equal(new URL(calls[0]).searchParams.get('key'), 'preferred-ga');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'ga511-920');
  assert.equal(rows[0].snapshotUrl, 'https://511ga.org/map/Cctv/920');
  assert.doesNotMatch(
    JSON.stringify(rows[0]),
    /preferred-ga|legacy-ga|invalid\.test/,
  );
});

test('Georgia 511 rejects coordinates outside Georgia bounds', async () => {
  const rows = await loadGeorgia511Sources({
    env: { GEORGIA_511_API_KEY: 'proof' },
    fetchImpl: async () =>
      Response.json([
        {
          Id: 55,
          Latitude: 40.7,
          Longitude: -74.0,
          Views: [{ Id: 921, Status: 'Enabled' }],
        },
      ]),
  });
  assert.deepEqual(rows, []);
});
