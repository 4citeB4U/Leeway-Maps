import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareDriveRoute,
  drivePosition,
  createDriveSession,
  distanceMeters,
} from './driveModeCore.js';
const raw = {
  geometry: [
    [0, 0],
    [0.01, 0],
    [0.02, 0],
  ],
  distanceM: 2224,
  steps: [
    { lon: 0, lat: 0, type: 'depart', instruction: 'Head east' },
    {
      lon: 0.01,
      lat: 0,
      type: 'turn',
      modifier: 'right',
      instruction: 'Turn right on Main Street',
    },
    { lon: 0.02, lat: 0, type: 'arrive', instruction: 'Arrive at destination' },
  ],
};
const now = 100000;
const position = (lon, lat = 0, extras = {}) => ({
  timestamp: now,
  coords: {
    longitude: lon,
    latitude: lat,
    accuracy: 8,
    speed: null,
    ...extras,
  },
});
test('GPS progress selects upcoming maneuver and remaining road distance', () => {
  const state = drivePosition(
    prepareDriveRoute(raw),
    position(0.005, 0, { speed: 10 }),
    { now },
  );
  assert.equal(state.state, 'guiding');
  assert.match(state.instruction, /Turn right/);
  assert.ok(state.nextDistanceM > 550 && state.nextDistanceM < 560);
  assert.ok(state.remainingM > 1660 && state.remainingM < 1680);
  assert.equal(state.speedMps, 10);
});
test('unknown GPS speed is not replaced with zero or invented movement speed', () => {
  const route = prepareDriveRoute(raw);
  assert.equal(drivePosition(route, position(0.005), { now }).speedMps, null);
  assert.equal(
    drivePosition(route, position(0.006, 0, { speed: -1 }), { now }).speedMps,
    null,
  );
  assert.equal(
    drivePosition(route, position(0.006, 0, { speed: 0 }), { now }).speedMps,
    0,
  );
});
test('off-route, low accuracy and stale GPS suppress turn instructions', () => {
  const route = prepareDriveRoute(raw);
  const off = drivePosition(route, position(0.005, 0.02), { now });
  assert.equal(off.state, 'off-route');
  assert.equal(off.instruction, undefined);
  const uncertain = drivePosition(
    route,
    position(0.005, 0, { accuracy: 120 }),
    { now },
  );
  assert.equal(uncertain.state, 'uncertain');
  assert.equal(uncertain.instruction, undefined);
  const stale = drivePosition(route, position(0.005, 0, { speed: 20 }), {
    now: now + 16000,
  });
  assert.equal(stale.state, 'stale');
  assert.equal(stale.speedMps, null);
});
test('destination proximity does not claim confirmed arrival', () => {
  const state = drivePosition(prepareDriveRoute(raw), position(0.01999), {
    now,
  });
  assert.equal(state.state, 'near-destination');
  assert.match(state.instruction, /confirm arrival/);
});
test('GPS watch starts only when requested and stop clears watch/timer and rejects late callbacks', () => {
  const events = [],
    cleared = [],
    intervals = [];
  let good,
    bad,
    calls = 0;
  const session = createDriveSession({
    geolocation: {
      watchPosition(success, error) {
        calls++;
        good = success;
        bad = error;
        return 42;
      },
      clearWatch: (id) => cleared.push(id),
    },
    onUpdate: (event) => events.push(event),
    now: () => now,
    setIntervalImpl: (fn) => {
      intervals.push(fn);
      return 7;
    },
    clearIntervalImpl: (id) => cleared.push(id),
  });
  assert.equal(calls, 0);
  session.start(raw);
  assert.equal(calls, 1);
  good(position(0.005));
  assert.equal(events.at(-1).state, 'guiding');
  session.stop();
  const count = events.length;
  good(position(0.006));
  bad({ code: 1 });
  intervals[0]();
  assert.equal(events.length, count);
  assert.deepEqual(cleared, [42, 7]);
});
test('GPS denial and subsequent stale signal show failure without fabricated guidance', () => {
  let good,
    bad,
    tick,
    time = now;
  const events = [];
  const session = createDriveSession({
    geolocation: {
      watchPosition(s, e) {
        good = s;
        bad = e;
        return 1;
      },
      clearWatch() {},
    },
    onUpdate: (e) => events.push(e),
    now: () => time,
    setIntervalImpl: (fn) => {
      tick = fn;
      return 1;
    },
    clearIntervalImpl() {},
  });
  session.start(raw);
  bad({ code: 1 });
  assert.equal(events.at(-1).state, 'denied');
  good(position(0.005, 0, { speed: 10 }));
  time += 16000;
  tick();
  assert.equal(events.at(-1).state, 'stale');
  assert.equal(events.at(-1).speedMps, null);
  session.stop();
});
test('route validation rejects missing and degenerate geometry; dateline distances stay bounded', () => {
  assert.throws(() => prepareDriveRoute(null), /Calculate/);
  assert.throws(
    () =>
      prepareDriveRoute({
        geometry: [
          [0, 0],
          [0, 0],
        ],
      }),
    /measurable/,
  );
  assert.ok(distanceMeters([179.999, 0], [-179.999, 0]) < 225);
});
