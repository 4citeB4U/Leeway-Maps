import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountFeatureCenter } from './featureCenter.js';

test('feature center renders every feature and delegates domain launch', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  const calls = [];
  const center = mountFeatureCenter({
    documentRef: dom.window.document,
    edition: 'business',
    catalog: [
      {
        id: 'routing',
        label: 'Routing',
        action: 'routing',
        state: 'map-native',
        features: ['Truck-safe routing', 'Alternate routes'],
      },
    ],
    onAction: async (action, row) => calls.push([action, row.id]),
  });
  assert.match(center.root.textContent, /Truck-safe routing/);
  assert.match(center.root.textContent, /Alternate routes/);
  center.open();
  assert.equal(center.root.hidden, false);
  center.root.querySelector('[data-launch]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [['routing', 'routing']]);
  center.destroy();
});
