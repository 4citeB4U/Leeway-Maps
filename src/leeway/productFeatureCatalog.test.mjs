import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_FEATURE_CATALOG,
  PERSONAL_FEATURE_CATALOG,
  featureCatalogForEdition,
  featureCatalogSummary,
} from './productFeatureCatalog.js';

test('business catalog includes trucking and municipal transit operating domains', () => {
  const ids = new Set(BUSINESS_FEATURE_CATALOG.map((row) => row.id));
  for (const id of [
    'truck-routing',
    'vehicle-cargo',
    'dispatch-tms',
    'eld-compliance',
    'fleet-telematics',
    'municipal-service-planning',
    'municipal-cadavl',
    'municipal-rider-info',
    'municipal-ada-demand',
    'municipal-fare-apc',
    'municipal-maintenance-safety',
  ]) {
    assert.equal(ids.has(id), true, id);
  }
  assert.ok(featureCatalogSummary('business').featureCount > 350);
});

test('personal catalog keeps shared map/rider capability and excludes business operations', () => {
  const ids = new Set(PERSONAL_FEATURE_CATALOG.map((row) => row.id));
  assert.equal(ids.has('navigation'), true);
  assert.equal(ids.has('public-transit-rider'), true);
  assert.equal(ids.has('personal-trip'), true);
  assert.equal(ids.has('dispatch-tms'), false);
  assert.equal(ids.has('fleet-telematics'), false);
  assert.equal(ids.has('municipal-cadavl'), false);
  assert.equal(featureCatalogForEdition('personal'), PERSONAL_FEATURE_CATALOG);
  assert.ok(featureCatalogSummary('personal').featureCount > 100);
});
