import test from 'node:test';
import assert from 'node:assert/strict';
import { assessConnection, boundsForPoints, formatConnectionAssessment, normalizeTruthState } from './journeyContinuityCore.js';

test('connection math keeps missing authority unknown', () => {
  const result = assessConnection({ nowMs: 1000, outboundDepartureMs: 9000 });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.reason, 'authoritative-times-required');
});

test('connection math classifies margin deterministically', () => {
  const now = Date.UTC(2026, 9, 3, 20, 0);
  const result = assessConnection({
    nowMs: now,
    inboundArrivalMs: now + 20 * 60_000,
    outboundDepartureMs: now + 45 * 60_000,
    minimumTransferMs: 10 * 60_000,
    inboundTruth: 'PREDICTED',
    outboundTruth: 'SCHEDULED',
  });
  assert.equal(result.state, 'WATCH');
  assert.equal(result.slackMs, 15 * 60_000);
  assert.match(formatConnectionAssessment(result), /15 min/);
});

test('stale live observations remain visibly stale', () => {
  const now = 1_000_000;
  const result = assessConnection({
    nowMs: now,
    inboundArrivalMs: now + 5000,
    outboundDepartureMs: now + 30 * 60_000,
    minimumTransferMs: 5 * 60_000,
    freshnessAgeMs: 5 * 60_000,
    maxFreshnessMs: 2 * 60_000,
    inboundTruth: 'LIVE',
  });
  assert.equal(result.truth.inbound, 'STALE');
  assert.equal(result.reason, 'inbound-live-data-stale');
});

test('map framing bounds all known subjects', () => {
  assert.deepEqual(boundsForPoints([{ lat:43, lon:-88 }, { lat:42, lon:-87 }], 0), {
    west:-88, south:42, east:-87, north:43
  });
  assert.equal(boundsForPoints([]), null);
});

test('truth states fail closed', () => {
  assert.equal(normalizeTruthState('live'), 'LIVE');
  assert.equal(normalizeTruthState('guessed'), 'UNAVAILABLE');
});
