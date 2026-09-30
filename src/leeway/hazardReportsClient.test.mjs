import test from 'node:test';
import assert from 'node:assert/strict';
import { createHazardReportsClient, normalizeReportServer } from './hazardReportsClient.js';

test('remote tokens require HTTPS; loopback permits local development', () => {
  assert.equal(normalizeReportServer('https://reports.example/'), 'https://reports.example');
  assert.equal(normalizeReportServer('http://127.0.0.1:4176'), 'http://127.0.0.1:4176');
  for (const url of ['http://reports.example', 'https://user:secret@reports.example', 'https://reports.example/?token=secret', 'https://reports.example/api']) {
    assert.throws(() => normalizeReportServer(url));
  }
});

test('client never treats local fixtures or malformed acknowledgement as broadcast', async () => {
  const client = createHazardReportsClient({ fetchImpl: async () => Response.json({ published: true, report: { kind: 'police' } }) });
  await assert.rejects(client.publish({ kind: 'police', lat: 1, lon: 2 }, 'long-enough-test-only-server-token'), /unconfirmed/);
});

test('network failure after submission is explicitly unconfirmed, never retried', async () => {
  let calls = 0;
  const client = createHazardReportsClient({ fetchImpl: async () => { calls++; throw new TypeError('Failed to fetch'); } });
  await assert.rejects(client.publish({ kind: 'police', lat: 1, lon: 2 }, 'long-enough-test-only-server-token'), /could not confirm/);
  assert.equal(calls, 1);
});

test('expired reports are removed and nearby queries send rounded coordinates only', async () => {
  let requested;
  const now = Date.now();
  const row = { id: 'old', kind: 'debris', lat: 1, lon: 2, createdAt: now - 10000,
    expiresAt: now - 1, source: 'community', verification: 'unverified' };
  const client = createHazardReportsClient({ fetchImpl: async url => {
    requested = url;
    return Response.json({ reports: [row], source: 'community', verification: 'unverified' });
  } });
  assert.deepEqual((await client.nearby({ lat: 1.000456, lon: 2.000345 })).reports, []);
  assert.match(requested, /lat=1&lon=2&radiusKm=10$/);
});
