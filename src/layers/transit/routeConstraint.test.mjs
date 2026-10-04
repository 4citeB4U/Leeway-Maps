import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteTraversal, sampleRouteTraversal } from './routeConstraint.js';

test('route traversal follows intermediate street geometry rather than a straight chord', () => {
  const traversal = buildRouteTraversal([
    [-87.90, 43.00],
    [-87.90, 43.01],
    [-87.89, 43.01],
  ]);
  const halfway = sampleRouteTraversal(traversal, 0.5);
  assert.ok(halfway.lat > 43.007);
  assert.ok(halfway.lon < -87.899);
  assert.notDeepEqual(
    [Number(halfway.lon.toFixed(3)), Number(halfway.lat.toFixed(3))],
    [-87.895, 43.005],
  );
});

test('route traversal fails closed without a usable path', () => {
  assert.equal(buildRouteTraversal([]), null);
  assert.equal(sampleRouteTraversal(null, 0.5), null);
});
