import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLeeWayTransitSource,
  LEEWAY_TRANSIT_FEED_ID,
} from './leewayTransit.js';

test('LeeWay source adds private fleet without altering public registry selection', () => {
  const source = createLeeWayTransitSource({
    fetchImpl: async () => ({ ok: true }),
  });
  const boston = source.feedsInRange(42.37, -71.11).map((feed) => feed.id);
  assert.equal(boston[0], LEEWAY_TRANSIT_FEED_ID);
  assert.ok(boston.includes('mbta'));
});

test('LeeWay source uses the private same-origin endpoint for its own feed', async () => {
  const calls = [];
  const source = createLeeWayTransitSource({
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true };
    },
  });
  await source.requestSnapshot(LEEWAY_TRANSIT_FEED_ID);
  assert.deepEqual(calls, ['/api/leeway-transit/vehicles']);
});

test('public feed requests still use the original transit proxy', async () => {
  const calls = [];
  const source = createLeeWayTransitSource({
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true };
    },
  });
  await source.requestSnapshot('mbta');
  assert.deepEqual(calls, ['/api/transit/vehicles/mbta']);
});
