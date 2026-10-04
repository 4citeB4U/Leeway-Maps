import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindLiveEvidenceToPlannedLeg,
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


test('planned leg binds only on exact normalized identity', () => {
  const legs = [{
    key: 'planned:flight:DAL1234',
    kind: 'flight',
    reference: 'DAL 1234',
    label: 'Delta 1234',
    truth: 'SCHEDULED',
    departureMs: 100,
  }];
  const bound = bindLiveEvidenceToPlannedLeg(legs, {
    key: 'flights:abc123',
    kind: 'flight',
    reference: 'DAL1234',
    aliases: ['DAL1234'],
    label: 'DAL1234',
    truth: 'LIVE',
    departureMs: 110,
  });
  assert.equal(bound.length, 1);
  assert.equal(bound[0].key, 'planned:flight:DAL1234');
  assert.equal(bound[0].truth, 'LIVE');
  assert.equal(bound[0].scheduledDepartureMs, 100);
});

test('nonmatching live subjects do not overwrite a planned leg', () => {
  const legs = [{ key:'planned:flight:AAL1', kind:'flight', reference:'AAL1', truth:'SCHEDULED' }];
  const next = bindLiveEvidenceToPlannedLeg(legs, {
    key:'flights:x', kind:'flight', reference:'DAL2', aliases:['DAL2'], truth:'LIVE'
  });
  assert.equal(next.length, 2);
  assert.equal(next[0].reference, 'AAL1');
});


test('live position without ETA preserves scheduled timing truth', () => {
  const legs = [{
    key:'planned:transit:MCTS80',
    kind:'transit',
    reference:'MCTS80',
    truth:'SCHEDULED',
    arrivalMs:5000,
    departureMs:1000,
  }];
  const next = bindLiveEvidenceToPlannedLeg(legs, {
    key:'transit-vehicles:x',
    kind:'vehicles',
    reference:'MCTS80',
    aliases:['MCTS80'],
    truth:'LIVE',
    arrivalMs:null,
    departureMs:null,
    point:{lat:43,lon:-88},
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].arrivalMs, 5000);
  assert.equal(next[0].truth, 'SCHEDULED');
  assert.equal(next[0].positionTruth, 'LIVE');
});
