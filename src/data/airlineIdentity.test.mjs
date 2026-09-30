import test from 'node:test';
import assert from 'node:assert/strict';
import { airlineIdentity, scheduleLabel } from './airlineIdentity.js';
import {
  createScheduleLookup,
  normalizeFlightSchedule,
} from '../../server/providers/aircraft/schedules.js';

test('carrier differentiation uses callsign, leaves unknowns unidentified', () => {
  assert.equal(airlineIdentity(' dal123 ')?.name, 'Delta Air Lines');
  assert.notEqual(
    airlineIdentity('DAL123').color,
    airlineIdentity('UAL123').color,
  );
  assert.equal(airlineIdentity('N123AB'), null);
  assert.equal(airlineIdentity('DAL'), null);
  assert.equal(airlineIdentity('XYZ123'), null);
});
const now = Date.parse('2026-09-29T15:00:00Z');
const row = {
  ident: 'DAL123',
  scheduled_out: '2026-09-29T14:00:00Z',
  scheduled_in: '2026-09-29T16:00:00Z',
  estimated_on: '2026-09-29T15:50:00Z',
  origin: { code_iata: 'ATL' },
  destination: { code_iata: 'MKE' },
};
test('schedule selects current unique operating flight; preserves landing versus gate times', () => {
  const s = normalizeFlightSchedule({ flights: [row] }, 'DAL123', now);
  assert.equal(s.status, 'available');
  assert.equal(s.destination, 'MKE');
  assert.notEqual(s.estimatedLanding, s.scheduledArrival);
  assert.match(scheduleLabel(s, now), /Landing estimated 2026-09-29 15:50 UTC/);
  assert.match(scheduleLabel(s, now + 360000), /stale/);
  assert.equal(
    normalizeFlightSchedule({ flights: [row, row] }, 'DAL123', now).status,
    'ambiguous',
  );
  assert.equal(
    normalizeFlightSchedule({ flights: [row] }, 'UAL123', now).status,
    'unavailable',
  );
  assert.equal(
    normalizeFlightSchedule({ flights: [row] }, 'DAL123', now + 86400000)
      .status,
    'unavailable',
  );
});
test('unconfigured schedules never call upstream; failures never produce invented times', async () => {
  const missing = createScheduleLookup({
    apiKey: '',
    fetchImpl: () => assert.fail(),
  });
  assert.equal((await missing('DAL123')).status, 'not-configured');
  const failure = createScheduleLookup({
    apiKey: 'fixture',
    fetchImpl: async () => ({ ok: false }),
    now: () => now,
  });
  assert.equal((await failure('DAL123')).status, 'unavailable');
});
test('concurrent and repeated lookups share one bounded provider request', async () => {
  let requests = 0;
  const lookup = createScheduleLookup({
    apiKey: 'fixture',
    now: () => now,
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(options.headers['x-apikey'], 'fixture');
      assert.match(url, /\/flights\/DAL123$/);
      return { ok: true, json: async () => ({ flights: [row] }) };
    },
  });
  await Promise.all([lookup('DAL123'), lookup('DAL123')]);
  await lookup('DAL123');
  assert.equal(requests, 1);
});
