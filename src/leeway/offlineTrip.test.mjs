import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFLINE_TRIP_KEY,
  LIMITS,
  encodeTrip,
  decodeTrip,
  loadTrip,
  saveTrip,
  markTripPrevious,
  deleteTrip,
  prepareTripGuidance,
  offlineGpsState,
} from '../../public/offlineTripCore.js';
const now = 1900000000000;
const route = {
  geometry: [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
  ],
  distanceM: 2224,
  durationS: 200,
  source: 'fixture road source',
  authority: 'Passenger road preview',
  steps: [
    { instruction: 'Turn right', lon: 0.01, lat: 0, distanceM: 1112 },
    { instruction: 'Arrive', lon: 0.02, lat: 0, distanceM: 0 },
  ],
  stops: [
    { lon: 0, lat: 0, label: 'Start' },
    { lon: 0.02, lat: 0, label: 'Destination' },
  ],
  preview: true,
};
function storage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) || null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}
test('a calculated trip round-trips after reopen with source, stops and directions', () => {
  const store = storage();
  saveTrip(route, store, now);
  const reopened = loadTrip(store, now + 1000);
  assert.equal(reopened.state, 'saved');
  assert.equal(reopened.trip.route.steps[0].instruction, 'Turn right');
  assert.deepEqual(reopened.trip.route.geometry, route.geometry);
  assert.equal(reopened.trip.active, true);
});
test('empty storage and explicit deletion do not fabricate a route', () => {
  const store = storage();
  assert.equal(loadTrip(store).state, 'empty');
  saveTrip(route, store, now);
  store.setItem('other-setting', 'keep');
  deleteTrip(store);
  assert.equal(loadTrip(store).trip, null);
  assert.equal(store.getItem('other-setting'), 'keep');
});
test('corrupt, future, invalid coordinates and oversized records are rejected', () => {
  assert.throws(() => decodeTrip('{broken', { now }), /corrupt/);
  assert.throws(
    () => decodeTrip('x'.repeat(LIMITS.characters + 1), { now }),
    /size/,
  );
  assert.throws(
    () => decodeTrip(encodeTrip(route, { now: now + 400000 }), { now }),
    /time/,
  );
  assert.throws(
    () =>
      encodeTrip({
        ...route,
        geometry: [
          [0, 0],
          [Infinity, 20],
        ],
      }),
    /geometry/,
  );
  assert.throws(
    () =>
      encodeTrip({
        ...route,
        geometry: Array.from({ length: LIMITS.points + 1 }, () => [0, 0]),
      }),
    /limit/,
  );
  assert.throws(
    () =>
      encodeTrip({
        ...route,
        steps: Array.from({ length: 501 }, () => ({
          instruction: 'Go',
          distanceM: 1,
        })),
      }),
    /instructions/,
  );
});
test('stale and canceled-or-edited labels remain separate from valid saved geometry', () => {
  const store = storage();
  saveTrip(route, store, now);
  markTripPrevious(store, now + 1000);
  const saved = loadTrip(store, now + LIMITS.staleMs + 1).trip;
  assert.equal(saved.stale, true);
  assert.equal(saved.active, false);
  assert.equal(saved.savedAt, now);
  assert.equal(saved.route.geometry.length, 3);
});
test('storage denial preserves explicit unavailable state instead of success', () => {
  const store = {
    getItem() {
      throw new Error('Storage denied');
    },
    setItem() {
      throw new Error('Quota exceeded');
    },
  };
  assert.equal(loadTrip(store).state, 'unavailable');
  assert.throws(() => saveTrip(route, store, now), /Quota/);
});
test('offline GPS derives current speed and next instruction without network calls', () => {
  const prepared = prepareTripGuidance(route);
  const position = {
    timestamp: now,
    coords: { longitude: 0.005, latitude: 0, accuracy: 5, speed: 10 },
  };
  const current = offlineGpsState(prepared, position, { now });
  assert.equal(current.state, 'guiding');
  assert.equal(current.speed, 10);
  assert.equal(current.message, 'Turn right');
  assert.ok(current.remaining > 1660 && current.remaining < 1680);
  const unknown = offlineGpsState(
    prepared,
    { ...position, coords: { ...position.coords, speed: null } },
    { now },
  );
  assert.equal(unknown.speed, null);
});
test('stale GPS and off-route positions do not invent navigation or rerouting', () => {
  const prepared = prepareTripGuidance(route);
  const pos = {
    timestamp: now,
    coords: { longitude: 0.005, latitude: 0.02, accuracy: 5, speed: 15 },
  };
  const off = offlineGpsState(prepared, pos, { now });
  assert.equal(off.state, 'off-route');
  assert.equal(off.remaining, undefined);
  assert.match(off.message, /no automatic offline rerouting/);
  const stale = offlineGpsState(prepared, pos, { now: now + 16000 });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.speed, null);
});
test('serialized route excludes arbitrary credentials, chat and GPS history properties', () => {
  const encoded = encodeTrip(
    { ...route, accessToken: 'secret', gpsHistory: [1, 2], chat: 'private' },
    { now },
  );
  assert.ok(!encoded.includes('secret'));
  assert.ok(!encoded.includes('gpsHistory'));
  assert.ok(!encoded.includes('private'));
  const value = JSON.parse(encoded);
  assert.equal(value.version, 1);
  assert.equal(OFFLINE_TRIP_KEY, 'leeway.logistics.offlineTrip.v1');
});
