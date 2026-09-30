import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTriangulation, estimateTriangleEconomics } from './triangulationCore.js';

const offer = (id, pickup, delivery, rate = 1000) => ({ id, pickup, delivery, rate });

test('builds a closed home-base loop in selected load order', () => {
  const plan = buildTriangulation({
    homeBase: '500 W Madison St, Chicago, IL 60661',
    offers: [
      offer('a', '100 N Main St, Milwaukee, WI 53202', '1 S Pinckney St, Madison, WI 53703', 1200),
      offer('b', '500 E Michigan St, Milwaukee, WI 53202', '123 N Market St, Chicago, IL 60606', 900),
    ],
  });
  assert.equal(plan.stops.length, 6);
  assert.equal(plan.stops[0].kind, 'HOME');
  assert.equal(plan.stops.at(-1).kind, 'RETURN');
  assert.equal(plan.stops[0].address, plan.stops.at(-1).address);
  assert.equal(plan.totalRate, 2100);
  assert.equal(plan.externalWrite, false);
});

test('does not silently produce a triangle without a home base', () => {
  assert.throws(() => buildTriangulation({ offers: [offer('a', 'A', 'B')] }), /Home base/);
});

test('calculates transparent fuel and rate planning math without an HOS claim', () => {
  const plan = buildTriangulation({ homeBase: 'Home', offers: [offer('a', 'Pickup', 'Delivery', 3000)] });
  const estimate = estimateTriangleEconomics({ plan, distanceM: 650 * 1609.344, durationS: 13 * 3600, mpg: 6.5, fuelPrice: 4, driverCostPerMile: 0.5, maintenanceCostPerMile: 0.2, fixedCostPerDay: 100, tollCost: 75, taxAndOtherCost: 25 });
  assert.equal(estimate.miles, 650);
  assert.equal(estimate.gallons, 100);
  assert.equal(estimate.fuelCost, 400);
  assert.equal(estimate.ratePerMile, 3000 / 650);
  assert.equal(estimate.elevenHourDrivingDays, 2);
  assert.equal(estimate.driverCost, 325);
  assert.equal(estimate.maintenanceCost, 130);
  assert.equal(estimate.fixedCost, 200);
  assert.equal(estimate.operatingCost, 1155);
  assert.equal(estimate.estimatedNet, 1845);
  assert.match(estimate.status, /REQUIRES_DISPATCH/);
});

test('rejects a hidden negative cost from the rate worksheet', () => {
  const plan = buildTriangulation({ homeBase: 'Home', offers: [offer('a', 'Pickup', 'Delivery')] });
  assert.throws(
    () => estimateTriangleEconomics({ plan, distanceM: 1000, durationS: 1, mpg: 8, fuelPrice: 4, tollCost: -1 }),
    /Toll cost/,
  );
});
