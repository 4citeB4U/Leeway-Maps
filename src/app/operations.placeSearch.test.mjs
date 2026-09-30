import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationOperations } from './operations.js';
import { FEATURE_SOURCE_METHODS } from '../sources/featureSource.js';
import { CANCELLED_SEARCH } from '../locations.js';

function noOpFeatures() {
  return Object.fromEntries(
    FEATURE_SOURCE_METHODS.map((name) => [name, async () => []]),
  );
}

test('application operations inject the configured place search into shell navigation', async () => {
  const controller = new AbortController();
  const calls = [];
  const placeSearch = {
    async geocode(query) {
      calls.push(query);
      return {
        place: {
          lat: 41.8781,
          lng: -87.6298,
          label: 'Chicago, IL',
          types: ['locality'],
          exact: true,
          viewport: null,
        },
        fallbackUsed: false,
      };
    },
  };

  const operations = createApplicationOperations({
    placeSearch,
    signal: controller.signal,
    eventTarget: new EventTarget(),
    requests: {
      terrain: { async getHeights() { return []; } },
      regional: { async getBrief() { return null; } },
      weather: { async getConditions() { return null; } },
      summary: { async summarize() { return null; } },
      features: noOpFeatures(),
    },
  });

  const viewer = {
    camera: {
      computeViewRectangle() {
        return null;
      },
    },
  };

  const result = await operations.searchAndFlyTo(viewer, 'Chicago, IL', {
    beforeFly: () => false,
  });

  assert.deepEqual(calls, ['Chicago, IL']);
  assert.equal(result, CANCELLED_SEARCH);
});
