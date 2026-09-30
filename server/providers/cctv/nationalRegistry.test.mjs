import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nationalTrafficCameraJurisdictions,
  nationalTrafficCameraSummary,
  nationalTrafficCameraJurisdiction,
} from './nationalRegistry.js';

test('national registry covers 50 states, DC, and five inhabited territories', () => {
  const rows = nationalTrafficCameraJurisdictions();
  const summary = nationalTrafficCameraSummary();
  assert.equal(rows.length, 56);
  assert.equal(summary.jurisdictionCount, 56);
  assert.equal(summary.stateCount, 50);
  assert.equal(summary.federalDistrictCount, 1);
  assert.equal(summary.territoryCount, 5);
  assert.equal(new Set(rows.map((row) => row.code)).size, 56);
});

test('seeded sources preserve verified authority and integration state', () => {
  const wisconsin = nationalTrafficCameraJurisdiction('WI');
  const newYork = nationalTrafficCameraJurisdiction('NY');
  const oregon = nationalTrafficCameraJurisdiction('OR');
  assert.equal(wisconsin.name, 'Wisconsin');
  assert.equal(wisconsin.sources[0].integrationStatus, 'key-required');
  assert.equal(wisconsin.sources[0].evidenceState, 'VERIFIED');
  const georgia = nationalTrafficCameraJurisdiction('GA');
  assert.equal(georgia.sources[0].integrationStatus, 'key-required');
  assert.equal(georgia.sources[0].mediaStatus, 'connector-built-key-blocked');
  assert.equal(newYork.sources[0].mediaStatus, 'connector-built-key-blocked');
  assert.ok(newYork.sources.some((source) => source.system === '511NY'));
  assert.ok(
    newYork.sources.some((source) => source.integrationStatus === 'integrated'),
  );
  assert.equal(oregon.sources[0].system, 'TripCheck');
  assert.equal(oregon.sources[0].accessMethod, 'documented_api');
});

test('unresearched jurisdictions remain explicit instead of guessed', () => {
  const alabama = nationalTrafficCameraJurisdiction('AL');
  assert.equal(alabama.researchStatus, 'research-required');
  assert.equal(alabama.sourceCount, 0);
  assert.deepEqual(alabama.sources, []);
});
