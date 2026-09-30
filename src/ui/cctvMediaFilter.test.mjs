import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraMatchesMediaFilter,
  cameraMediaLabel,
} from './cctvMediaFilter.js';

test('discovery filters distinguish video, snapshots and location-only sources', () => {
  const cameras = [
    {
      id: 'clip',
      feedType: 'mp4',
      mediaCapabilities: { video: true, snapshot: true },
    },
    {
      id: 'live',
      feedType: 'hls',
      mediaCapabilities: { video: true, snapshot: false },
    },
    {
      id: 'still',
      feedType: 'image',
      mediaCapabilities: { video: false, snapshot: true },
    },
    {
      id: 'location',
      feedType: 'image',
      mediaCapabilities: { video: false, snapshot: false, locationOnly: true },
    },
  ];
  assert.deepEqual(
    cameras
      .filter((c) => cameraMatchesMediaFilter(c, 'video'))
      .map((c) => c.id),
    ['clip', 'live'],
  );
  assert.deepEqual(
    cameras
      .filter((c) => cameraMatchesMediaFilter(c, 'snapshot'))
      .map((c) => c.id),
    ['clip', 'still'],
  );
  assert.equal(
    cameras.filter((c) => cameraMatchesMediaFilter(c, 'all')).length,
    4,
  );
  assert.deepEqual(cameras.map(cameraMediaLabel), [
    'VIDEO CLIP',
    'LIVE VIDEO',
    'SNAPSHOT',
    'LOCATION ONLY',
  ]);
});
