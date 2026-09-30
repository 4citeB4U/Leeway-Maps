import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_WORLD_LAYER_BUNDLES,
  enablePersonalWorldBundle,
} from './personalTravelPanel.js';

test('personal world bundles cover traffic, CCTV, weather and infrastructure', () => {
  assert.ok(PERSONAL_WORLD_LAYER_BUNDLES.travel.layers.includes('traffic'));
  assert.ok(PERSONAL_WORLD_LAYER_BUNDLES.travel.layers.includes('cctv'));
  assert.ok(
    PERSONAL_WORLD_LAYER_BUNDLES.weather.layers.includes('weather-lightning'),
  );
  assert.ok(
    PERSONAL_WORLD_LAYER_BUNDLES.infrastructure.layers.includes('osm-pipelines'),
  );
  assert.ok(PERSONAL_WORLD_LAYER_BUNDLES.world.layers.includes('earthquakes'));
});

test('bundle activation reports fulfilled, failed and unavailable layers separately', async () => {
  const calls = [];
  const manager = {
    layers: new Map([
      ['traffic', {}],
      ['cctv', {}],
    ]),
    setEnabled(id, enabled, options) {
      calls.push([id, enabled, options?.origin]);
      if (id === 'cctv') return Promise.reject(new Error('offline'));
      return Promise.resolve();
    },
  };

  const result = await enablePersonalWorldBundle(manager, [
    'traffic',
    'cctv',
    'missing-layer',
  ]);
  assert.deepEqual(calls, [
    ['traffic', true, 'user'],
    ['cctv', true, 'user'],
  ]);
  assert.deepEqual(result, {
    requested: 2,
    fulfilled: 1,
    failed: 1,
    missing: ['missing-layer'],
  });
});
