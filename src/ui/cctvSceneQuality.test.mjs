import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraSceneQuality, inspectCameraScene } from './cctvSceneQuality.js';

test('a bright timestamp border does not conceal a blank central camera scene', () => {
  const width = 64,
    height = 36;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++)
    for (let y of [0, 1, 34, 35]) {
      data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
    }
  assert.equal(cameraSceneQuality({ data, width, height }), 'dark-or-blank');
  data.fill(100);
  assert.equal(cameraSceneQuality({ data, width, height }), 'unverified');
});

test('uninspectable imagery is unknown, never classified as offline or good', () => {
  assert.equal(inspectCameraScene({}, undefined), 'unknown');
  assert.equal(
    inspectCameraScene(
      {},
      {
        createElement() {
          throw new Error('tainted');
        },
      },
    ),
    'unknown',
  );
});
