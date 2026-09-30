import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavigation } from './navigation.js';

test('missing London feeds do not substitute a Finnish camera while global inventory is retained', () => {
  const records = [
    { camera: { id: 'finland', cityId: 'finland', lat: 61.47, lon: 23.7 } },
  ];
  const state = {
    _records: records,
    _viewer: {
      scene: { canvas: { clientWidth: 800, clientHeight: 600 }, globe: {} },
      camera: {
        pickEllipsoid: () => null,
        positionCartographic: {
          latitude: (51.5 * Math.PI) / 180,
          longitude: (-0.12 * Math.PI) / 180,
          height: 1000,
        },
      },
    },
  };
  const navigation = createNavigation({
    state,
    services: {},
    parts: { model: { haversineKm: () => 1800 } },
  });
  assert.deepEqual(navigation.scopedRecordsNearViewer(), []);
  assert.equal(navigation.nearestCameraIdToViewer(), null);
  assert.equal(state._records.length, 1);
  state._viewer.camera.positionCartographic.height = 2000000;
  assert.equal(navigation.scopedRecordsNearViewer().length, 1);
  assert.equal(navigation.nearestCameraIdToViewer(), 'finland');
});

test('an available local camera remains eligible for an explicit nearest selection', () => {
  const record = { camera: { id: 'london', lat: 51.5, lon: -0.12 } };
  const state = {
    _records: [record],
    _viewer: {
      scene: { canvas: {} },
      camera: {
        pickEllipsoid: () => null,
        positionCartographic: {
          latitude: (51.5 * Math.PI) / 180,
          longitude: 0,
          height: 1000,
        },
      },
    },
  };
  const navigation = createNavigation({
    state,
    services: {},
    parts: { model: { haversineKm: () => 2 } },
  });
  assert.deepEqual(navigation.scopedRecordsNearViewer(), [record]);
  assert.equal(navigation.nearestCameraIdToViewer(), 'london');
});
