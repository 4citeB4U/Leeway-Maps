import test from 'node:test';
import assert from 'node:assert/strict';
import { personalPlacesTier } from './personalPlacesOverlay.js';

test('business labels are admitted only at useful street/city zooms', () => {
  assert.deepEqual(personalPlacesTier(1000), {
    maxHeightM: 2500, radiusM: 1200, limit: 20, labelMaxM: 2200,
  });
  assert.equal(personalPlacesTier(25000), null);
});

test('business density falls as the camera rises', () => {
  assert.ok(personalPlacesTier(2000).limit > personalPlacesTier(12000).limit);
  assert.ok(personalPlacesTier(12000).radiusM > personalPlacesTier(2000).radiusM);
});
