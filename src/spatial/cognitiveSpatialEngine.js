/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LEEWAY.MAPS.SPATIAL
TAG: LEEWAY.MAPS.SPATIAL.COGNITIVE_PROVIDER
5WH:
WHAT = Cesium-backed spatial measurement provider for LeeWay Cognitive State Fabric
WHY = Offloads geodesy/reference-frame math from Formula and LLM paths
WHO = LeeWay Maps / Runtime Fabric consumers
WHERE = src/spatial/cognitiveSpatialEngine.js
WHEN = 2026
HOW = Cesium WGS84 geodesics + Cartesian/ENU transforms -> raw provenance-bound measurements
LICENSE: MIT
*/
import * as Cesium from 'cesium';

export const SPATIAL_PROVIDER_ID = 'leeway-maps-cesium-spatial-v1';

function point(value, label) {
  const p = { lon: Number(value?.lon), lat: Number(value?.lat), height: Number(value?.height ?? 0) };
  if (![p.lon, p.lat, p.height].every(Number.isFinite)) throw new Error(`SPATIAL_INVALID_${label.toUpperCase()}`);
  if (p.lon < -180 || p.lon > 180 || p.lat < -90 || p.lat > 90) throw new Error(`SPATIAL_RANGE_${label.toUpperCase()}`);
  return p;
}
function cartographic(p) { return Cesium.Cartographic.fromDegrees(p.lon, p.lat, p.height); }
function cartesian(p) { return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height); }

export function measureRelation(anchorInput, targetInput) {
  const anchor = point(anchorInput, 'anchor');
  const target = point(targetInput, 'target');
  const geodesic = new Cesium.EllipsoidGeodesic(cartographic(anchor), cartographic(target));
  const a = cartesian(anchor);
  const b = cartesian(target);
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(a);
  const inverse = Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4());
  const local = Cesium.Matrix4.multiplyByPoint(inverse, b, new Cesium.Cartesian3());
  return {
    surfaceDistanceM: geodesic.surfaceDistance,
    slantDistanceM: Cesium.Cartesian3.distance(a, b),
    startHeadingRad: Number.isFinite(geodesic.startHeading) ? geodesic.startHeading : 0,
    altitudeDeltaM: target.height - anchor.height,
    enuOffsetM: { east: local.x, north: local.y, up: local.z },
  };
}

export function analyzeSpatialState({ anchor, targets = [], route = [] }) {
  if (!Array.isArray(targets) || !Array.isArray(route)) throw new Error('SPATIAL_ARRAYS_REQUIRED');
  const origin = point(anchor, 'anchor');
  const relations = targets.map((target, index) => ({ index, ...measureRelation(origin, target) }));
  const routePoints = [origin, ...route.map((p, i) => point(p, `route_${i}`))];
  let routeDistanceM = 0;
  for (let i = 1; i < routePoints.length; i++) routeDistanceM += measureRelation(routePoints[i - 1], routePoints[i]).surfaceDistanceM;
  const distances = relations.map((r) => r.surfaceDistanceM);
  return {
    schemaVersion: '1.0.0',
    providerId: SPATIAL_PROVIDER_ID,
    engine: 'CesiumJS',
    engineVersion: Cesium.VERSION,
    coordinateReference: 'WGS84',
    evidenceClass: 'COMPUTED_SPATIAL_MEASUREMENT',
    formulaDisposition: 'RAW_NOT_FORMULA',
    anchor: origin,
    metrics: {
      targetCount: relations.length,
      nearestTargetM: distances.length ? Math.min(...distances) : null,
      farthestTargetM: distances.length ? Math.max(...distances) : null,
      routeDistanceM,
    },
    relations,
  };
}
