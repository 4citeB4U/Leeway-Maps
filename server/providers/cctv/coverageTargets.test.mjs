import test from 'node:test';
import assert from 'node:assert/strict';
import { globalCctvExpansionSummary, globalCctvExpansionTargets } from './coverageTargets.js';

test('coverage targets never claim integration before an adapter exists', () => {
  const rows = globalCctvExpansionTargets();
  assert.ok(rows.length >= 8);
  assert.equal(rows.some((row) => row.adapterStatus === 'implemented'), false);
  assert.ok(rows.some((row) => row.countryIso === 'KOR' && row.mediaPotential === 'live-video-api'));
  assert.ok(rows.some((row) => row.countryIso === 'CHN' && row.mediaPotential === 'metadata-only'));
});

test('coverage summary keeps research gaps explicit', () => {
  const summary = globalCctvExpansionSummary();
  assert.ok(summary.researchRequiredCount > 0);
  assert.ok(summary.verifiedSourceCount > 0);
});
