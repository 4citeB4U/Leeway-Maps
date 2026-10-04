/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MAPS.TEST
TAG: LEEWAY.MAPS.TEST.COGNITIVE_SPATIAL
WHAT = Verifies Cesium spatial measurements used by Cognitive State Fabric
WHY = Prevents visual/render state from masquerading as measured spatial evidence
WHO = LeeWay Maps
WHERE = src/spatial/cognitiveSpatialEngine.test.mjs
WHEN = 2026
HOW = Node test assertions against WGS84 geodesic and ENU invariants
LICENSE: MIT
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpatialState, measureRelation } from './cognitiveSpatialEngine.js';

test('same point has zero spatial displacement', () => {
  const r = measureRelation({ lon: 0, lat: 0 }, { lon: 0, lat: 0 });
  assert.ok(Math.abs(r.surfaceDistanceM) < 1e-8);
  assert.ok(Math.abs(r.slantDistanceM) < 1e-8);
  assert.ok(Math.abs(r.enuOffsetM.east) < 1e-8);
});

test('WGS84 one-degree equatorial arc is Cesium-computed', () => {
  const r = measureRelation({ lon: 0, lat: 0 }, { lon: 1, lat: 0 });
  assert.ok(r.surfaceDistanceM > 111000 && r.surfaceDistanceM < 111500);
  assert.ok(Number.isFinite(r.enuOffsetM.east));
});

test('spatial packet remains raw evidence rather than Formula state', () => {
  const packet = analyzeSpatialState({
    anchor: { lon: -87.9065, lat: 43.0389, height: 188 },
    targets: [{ lon: -87.9, lat: 43.04, height: 190 }],
    route: [{ lon: -87.91, lat: 43.05 }, { lon: -87.92, lat: 43.06 }],
  });
  assert.equal(packet.providerId, 'leeway-maps-cesium-spatial-v1');
  assert.equal(packet.formulaDisposition, 'RAW_NOT_FORMULA');
  assert.ok(packet.metrics.routeDistanceM > 0);
});
