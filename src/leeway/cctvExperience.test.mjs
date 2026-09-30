import test from 'node:test';
import assert from 'node:assert/strict';
import { openNearestCctv } from './cctvExperience.js';

test('opens CCTV, waits for its catalog and focuses the nearest camera', async () => {
  let enabled = false;
  let polls = 0;
  const calls = [];
  const module = {
    getUIState() {
      polls += 1;
      if (polls < 2)
        return { totalCount: 0, count: 0, cameras: [], error: null };
      return {
        totalCount: 2,
        count: 1,
        activeCamera: {
          id: 'cam-2',
          name: 'I-94 at Test',
          provider: 'Official DOT',
        },
        cameras: [{ id: 'cam-2' }],
        error: null,
      };
    },
    focusNearest(options) {
      calls.push(options);
      return 'cam-2';
    },
  };
  const manager = {
    layers: new Map([['cctv', { module }]]),
    isEnabled() {
      return enabled;
    },
    async setEnabled(id, value, options) {
      assert.equal(id, 'cctv');
      assert.equal(options.origin, 'user');
      enabled = value;
    },
  };

  let clock = 0;
  const result = await openNearestCctv(manager, {
    sleep: async () => {
      clock += 10;
    },
    now: () => clock,
    pollMs: 10,
    waitMs: 100,
  });

  assert.equal(enabled, true);
  assert.equal(result.ok, true);
  assert.equal(result.cameraId, 'cam-2');
  assert.equal(result.camera.provider, 'Official DOT');
  assert.deepEqual(calls, [{ focus: true, durationSec: 1.8 }]);
});

test('reports an empty registered catalog without pretending CCTV opened', async () => {
  let clock = 0;
  const manager = {
    layers: new Map([
      [
        'cctv',
        {
          module: {
            getUIState: () => ({
              totalCount: 0,
              count: 0,
              cameras: [],
              error: null,
            }),
            focusNearest: () => null,
          },
        },
      ],
    ]),
    isEnabled: () => true,
  };

  const result = await openNearestCctv(manager, {
    waitMs: 20,
    pollMs: 10,
    sleep: async () => {
      clock += 10;
    },
    now: () => clock,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-cameras');
});
