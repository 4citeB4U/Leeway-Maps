import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteCamera } from './routeCamera.js';
test('route fitting and device destinations release current camera owner before moving', async () => {
  const calls = [], entities = [{}], destination = { duration: 1 };
  const camera = createRouteCamera({ camera: { flyTo: options => calls.push(options) }, flyTo: async (rows, options) => { calls.push(rows, options); return true; } }, fly => { calls.push('release'); return fly(); });
  assert.equal(camera.point(destination), true); assert.equal(await camera.route(entities), true);
  assert.deepEqual(calls, ['release', destination, 'release', entities, { duration: 1 }]);
});
test('camera refusal leaves both routes stationary', () => {
  const camera = createRouteCamera({ camera: { flyTo() { assert.fail(); } }, flyTo() { assert.fail(); } }, () => false);
  assert.equal(camera.point({}), false); assert.equal(camera.route([]), false);
});
