import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransitMatchRequest } from './transit-map-match.js';

test('transit map matching accepts bounded bus traces only', () => {
  const request = normalizeTransitMatchRequest({
    mode: 'bus',
    points: [
      { lat: 43, lon: -88, time: 1000 },
      { lat: 43.001, lon: -88, time: 2000 },
      { lat: 43.002, lon: -87.999, time: 3000 },
    ],
  });
  assert.equal(request.mode, 'bus');
  assert.equal(request.points.length, 3);
});

test('transit map matching rejects unsupported rail snapping and short traces', () => {
  assert.throws(() => normalizeTransitMatchRequest({
    mode: 'rail',
    points: [{lat:1,lon:1},{lat:1.1,lon:1.1},{lat:1.2,lon:1.2}],
  }), /buses/);
  assert.throws(() => normalizeTransitMatchRequest({
    mode: 'bus',
    points: [{lat:1,lon:1},{lat:1.1,lon:1.1}],
  }), /3–12/);
});
