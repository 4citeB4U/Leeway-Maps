import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectionChange,
  connectionEvidenceReady,
  routePlannerLeg,
  timedTruthAllowsConnection,
  upsertJourneyLeg,
} from './journeyItineraryCore.js';

test('route planner becomes a mapped journey leg without pretending to be live', () => {
  const leg = routePlannerLeg({
    travelMode: 'foot',
    stops: [
      { text: 'A', point: { lat: 43, lon: -88, label: 'A' } },
      { text: 'B', point: { lat: 43.1, lon: -87.9, label: 'B' } },
    ],
    route: { durationS: 600, distanceM: 800, source: 'OSRM / OpenStreetMap' },
  }, 1000);
  assert.equal(leg.kind, 'foot');
  assert.equal(leg.truth, 'MAPPED');
  assert.equal(leg.arrivalMs, 601000);
});

test('stable identities update in place', () => {
  const first = upsertJourneyLeg([], { key: 'flight:x', label: 'X', truth: 'SCHEDULED' });
  const second = upsertJourneyLeg(first, { key: 'flight:x', label: 'X', truth: 'LIVE' });
  assert.equal(second.length, 1);
  assert.equal(second[0].truth, 'LIVE');
});

test('only timed source truth can drive transfer assessment', () => {
  assert.equal(timedTruthAllowsConnection('LIVE'), true);
  assert.equal(timedTruthAllowsConnection('PREDICTED'), true);
  assert.equal(timedTruthAllowsConnection('SCHEDULED'), true);
  assert.equal(timedTruthAllowsConnection('MAPPED'), false);
  assert.equal(connectionEvidenceReady(
    { truth: 'MAPPED', arrivalMs: 10 },
    { truth: 'SCHEDULED', departureMs: 20 },
  ), false);
});

test('connection changes notify only on state or material margin changes', () => {
  assert.equal(connectionChange(
    { state: 'GOOD', slackMs: 30 * 60_000 },
    { state: 'GOOD', slackMs: 28 * 60_000 },
  ).meaningful, false);
  assert.equal(connectionChange(
    { state: 'GOOD', slackMs: 30 * 60_000 },
    { state: 'WATCH', slackMs: 14 * 60_000 },
  ).meaningful, true);
});
