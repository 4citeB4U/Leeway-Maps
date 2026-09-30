import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFuelOffers, usableStationReport, corridorQuery } from './fuelAdvisor.js';
test('cheapest pump price can lose after road detour fuel; time constraint wins', () => {
  const ranked = compareFuelOffers([{ price: 3, detourM: 160934.4, detourSeconds: 600 }, { price: 4, detourM: 0, detourSeconds: 0 }, { price: 1, detourM: 0, detourSeconds: 2000 }], { gallons: 20, mpg: 5, benchmarkPrice: 4 });
  assert.equal(ranked.length, 2); assert.equal(ranked[0].price, 4); assert.equal(ranked[0].total, 80); assert.equal(ranked[1].total, 140);
});
test('regional estimates cannot be treated as station reports and stale reports expire', () => {
  const now = Date.parse('2026-09-28T00:00:00Z');
  const report = { kind: 'REPORTED_STATION_PRICE', fuel: 'diesel', priceUsdPerGallon: 4, reportedAt: '2026-09-27T00:00:00Z' };
  assert.equal(usableStationReport(report, now), true);
  assert.equal(usableStationReport({ ...report, kind: 'WEEKLY_REGIONAL_DIESEL_AVERAGE' }, now), false);
  assert.equal(usableStationReport({ ...report, reportedAt: '2026-09-24T00:00:00Z' }, now), false);
});
test('corridor lookup has bounded sample count and rejects invalid positions', () => {
  assert.equal((corridorQuery(Array.from({ length: 100 }, (_, i) => [-77, 38 + i / 1000])).match(/nwr\(/g) || []).length, 12);
  assert.throws(() => corridorQuery([[NaN, 1], [2, 3]]));
});
