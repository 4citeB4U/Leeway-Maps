import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSourceItem } from './normalize.js';

test('CCTV normalization preserves snapshot freshness metadata', () => {
  const row = normalizeSourceItem({
    id: 'il-gateway-test',
    name: 'Chicago Test Camera',
    lat: 41.88,
    lon: -87.64,
    feedType: 'image',
    frameRefreshMs: 300000,
    ageMinutes: 4,
    warningAge: true,
  });

  assert.equal(row.id, 'il-gateway-test');
  assert.equal(row.frameRefreshMs, 300000);
  assert.equal(row.ageMinutes, 4);
  assert.equal(row.warningAge, true);
});
