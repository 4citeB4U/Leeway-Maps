import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFuelRecords, measuredFuelEconomy, deleteFuelRecord, estimateFuelRange, estimateLoadQuote, decodeFuelLedger } from './fuelLedgerCore.js';
const fill = (id, odometer, gallons, full = true) => ({ id, date: '2026-09-28', odometer, gallons, full });
test('full-to-full measurement includes intervening partial gallons and excludes opening/trailing fills', () => {
  const rows = [fill('before', 0, 10, false), fill('a', 100, 100), fill('partial', 200, 10, false), fill('b', 400, 20), fill('c', 600, 40), fill('pending', 700, 99, false)];
  const result = measuredFuelEconomy(rows);
  assert.equal(result.miles, 500); assert.equal(result.gallons, 70); assert.equal(result.mpg, 500 / 70);
  assert.deepEqual(result.intervals.map(row => row.mpg), [10, 5]); assert.equal(result.pendingPartialFills, 1);
  assert.equal(measuredFuelEconomy([fill('a', 100, 10), fill('b', 200, 10, false)]).mpg, null);
});
test('deleting a partial fill breaks the affected measurement instead of inflating MPG', () => {
  const rows = [fill('a', 100, 30), fill('b', 200, 10, false), fill('c', 400, 20), fill('d', 600, 20)];
  const next = deleteFuelRecord(rows, 'b'), result = measuredFuelEconomy(next);
  assert.equal(next[1].gapBefore, true); assert.equal(result.intervals.length, 1); assert.equal(result.mpg, 10);
  assert.equal(result.intervals[0].from, 'c');
  const deletedLast = deleteFuelRecord([fill('a', 100, 30), fill('b', 200, 10, false)], 'b');
  assert.equal(measuredFuelEconomy([...deletedLast, fill('c', 400, 20)]).mpg, null);
});
test('record and stored input bounds reject duplicates, impossible dates and oversize data', () => {
  assert.throws(() => normalizeFuelRecords([fill('a', 100, 10), fill('b', 100, 20)]));
  assert.throws(() => normalizeFuelRecords([{ ...fill('a', 100, 10), date: '2026-02-30' }]));
  assert.throws(() => normalizeFuelRecords([fill('a', 100, Infinity)]));
  assert.throws(() => decodeFuelLedger('x'.repeat(100001)));
  assert.deepEqual(decodeFuelLedger(JSON.stringify({ version: 1, records: [], settings: { mpg: '8', password: 'excluded' } })).settings, { mpg: '8' });
});
test('range uses manually entered tank state and reserve without manufacturing fuel', () => {
  assert.equal(estimateFuelRange({ capacity: 100, current: 50, reserve: 10, mpg: 8 }).estimatedMiles, 320);
  assert.equal(estimateFuelRange({ capacity: 100, current: 5, reserve: 10, mpg: 8 }).estimatedMiles, 0);
  assert.throws(() => estimateFuelRange({ capacity: 100, current: 101, reserve: 0, mpg: 8 }));
  assert.throws(() => estimateFuelRange({ capacity: 100, current: 50, reserve: '', mpg: 8 }));
});
test('quote includes all mileage and costs and computes margin on revenue, not markup', () => {
  const input = { loadedMiles: 400, deadheadMiles: 50, returnMiles: 50, mpg: 10, fuelPrice: 4, tolls: 20, labor: 100, operating: 50, taxFees: 30, targetMargin: 20, offeredRevenue: 450 };
  const result = estimateLoadQuote(input);
  assert.equal(result.miles, 500); assert.equal(result.gallons, 50); assert.equal(result.fuelCost, 200);
  assert.equal(result.totalCost, 400); assert.equal(result.suggestedCounteroffer, 500);
  assert.equal(result.offeredProfit, 50); assert.equal(result.offeredMargin, 50 / 450 * 100);
  assert.throws(() => estimateLoadQuote({ ...input, taxFees: '' }));
  assert.throws(() => estimateLoadQuote({ ...input, targetMargin: 100 }));
  assert.equal(estimateLoadQuote({ ...input, offeredRevenue: 0 }).offeredMargin, null);
  assert.equal(estimateLoadQuote({ ...input, offeredRevenue: '' }).offeredRevenue, null);
});
