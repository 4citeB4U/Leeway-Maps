import test from 'node:test';
import assert from 'node:assert/strict';
import { cockpitPoseFromTrackedInfo } from './personalCockpitViewport.js';

test('cockpit pose uses source position and heading without changing identity', () => {
  const pose = cockpitPoseFromTrackedInfo({
    latitude: 43.03,
    longitude: -87.91,
    altitudeM: 1000,
    track: 92,
  });
  assert.deepEqual(pose, {
    latitude: 43.03,
    longitude: -87.91,
    altitudeM: 1008,
    headingDeg: 92,
    pitchDeg: -4,
  });
});

test('cockpit pose fails closed without a source position', () => {
  assert.equal(cockpitPoseFromTrackedInfo({ altitudeM: 1000 }), null);
});
