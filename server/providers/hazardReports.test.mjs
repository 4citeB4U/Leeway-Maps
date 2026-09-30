import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHazardReportStore, createHazardReportsHandler } from './hazardReports.js';
import { createHazardReportsClient } from '../../src/leeway/hazardReportsClient.js';

const token = 'test-only-report-token-not-a-real-secret';
async function host(t, options = {}) {
  const server = createServer(createHazardReportsHandler({ enabled: true, writeToken: token, ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('two independent clients see a server-confirmed shared report, rounded location and exact TTL', async t => {
  let now = Date.now();
  const base = await host(t, { store: createHazardReportStore({ now: () => now }) });
  const driverA = createHazardReportsClient({ serverUrl: base });
  const driverB = createHazardReportsClient({ serverUrl: base });
  assert.equal((await driverB.nearby({ lat: 38.9, lon: -77.035 })).reports.length, 0);
  const published = await driverA.publish({ kind: 'debris', lat: 38.9003456, lon: -77.0354321 }, token);
  assert.equal(published.published, true);
  assert.equal(published.report.lat, 38.9);
  assert.equal(published.report.lon, -77.035);
  assert.equal(published.report.verification, 'unverified');
  assert.equal(published.report.expiresAt - published.report.createdAt, 3600000);
  const nearby = await driverB.nearby({ lat: 38.9, lon: -77.035 });
  assert.equal(nearby.reports[0].id, published.report.id);
  assert.equal((await driverB.nearby({ lat: 41.878, lon: -87.630 })).reports.length, 0);
  now += 3600001;
  assert.equal((await driverB.nearby({ lat: 38.9, lon: -77.035 })).reports.length, 0);
});

test('unconfigured hosting and invalid credentials never publish reports', async t => {
  const disabled = await host(t, { enabled: false });
  const unavailable = createHazardReportsClient({ serverUrl: disabled });
  assert.equal((await unavailable.status()).available, false);
  await assert.rejects(unavailable.publish({ kind: 'police', lat: 0, lon: 0 }, token), /Nothing was broadcast/);
  const base = await host(t);
  const client = createHazardReportsClient({ serverUrl: base });
  await assert.rejects(client.publish({ kind: 'police', lat: 0, lon: 0 }, 'wrong-token-that-is-long-enough'), /valid.*token/);
  assert.deepEqual((await client.nearby({ lat: 0, lon: 0 })).reports, []);
});

test('server rejects identities, oversized bodies, malformed locations and bounds report frequency', async t => {
  const base = await host(t);
  const post = body => fetch(`${base}/api/hazard-reports`, { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }, body: JSON.stringify(body) });
  assert.equal((await post({ kind: 'police', lat: 1, lon: 2, plate: 'NO IDENTITIES' })).status, 400);
  assert.equal((await post({ kind: 'debris', lat: 91, lon: 0 })).status, 400);
  assert.equal((await post({ kind: 'unknown', lat: 1, lon: 2 })).status, 400);
  assert.equal((await post({ text: 'x'.repeat(5000) })).status, 413);
  assert.equal((await fetch(`${base}/api/hazard-reports?lat=&lon=0`)).status, 400);
  assert.equal((await fetch(`${base}/api/hazard-reports?lat=0&lon=0&radiusKm=1000`)).status, 400);
  assert.equal((await post({ kind: 'debris', lat: 1, lon: 2 })).status, 201);
  assert.equal((await post({ kind: 'debris', lat: 1, lon: 2 })).status, 201);
  assert.equal((await post({ kind: 'debris', lat: 1, lon: 2 })).status, 429);
});

test('result cap is explicit, and process-local storage is not durable', () => {
  const store = createHazardReportStore();
  for (let i = 0; i < 101; i++) store.publish({ kind: 'congestion', lat: 1, lon: 2 });
  const nearby = store.nearby({ lat: 1, lon: 2 }, 10);
  assert.equal(nearby.reports.length, 100);
  assert.equal(nearby.truncated, true);
  assert.equal(createHazardReportStore().nearby({ lat: 1, lon: 2 }, 10).reports.length, 0);
});
