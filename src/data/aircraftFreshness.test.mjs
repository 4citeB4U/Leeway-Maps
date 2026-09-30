import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraftPositionStatus } from './aircraftFreshness.js';
test('fresh receipt or contact cannot make an old position fresh', () => {
  const result = aircraftPositionStatus({ positionTimeMs: 1000, lastContactEpochMs: 400000 }, { now: 400000 });
  assert.equal(result.stale, true);
  assert.equal(result.positionTimeMs, 1000);
  assert.equal(result.positionAgeSeconds, 399);
  assert.match(result.positionStatus, /Last known/);
});
test('recent position stays fresh; missing position timestamp and feed backoff are explicit', () => {
  assert.equal(aircraftPositionStatus({positionTimeMs:1000}, {now:30000}).stale, false);
  assert.equal(aircraftPositionStatus({positionTimeMs:1000}, {now:30000,stale:true}).stale, true);
  assert.match(aircraftPositionStatus({}).positionStatus, /unavailable/);
});
