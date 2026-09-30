import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTruckRestriction,
  summarizeTruckRouteSafety,
} from './truckRoutePolicy.js';

const truck = {
  heightM: 4.1148,
  widthM: 2.591,
  lengthM: 22.86,
  grossWeightKg: 36287,
};

test('truck gate blocks a known low clearance', () => {
  const result = evaluateTruckRestriction(truck, { maxheightM: 3.9 });
  assert.equal(result.pass, false);
  assert.deepEqual(result.reasons, ['HEIGHT_EXCEEDS_LIMIT']);
});

test('truck gate blocks HGV access restrictions', () => {
  const result = evaluateTruckRestriction(truck, { hgv: 'no' });
  assert.equal(result.pass, false);
  assert.ok(result.reasons.includes('HGV_ACCESS_RESTRICTED'));
});
test('no restriction evidence remains explicitly unverified', () => {
  const result = summarizeTruckRouteSafety(truck, []);
  assert.equal(result.status, 'UNVERIFIED');
  assert.equal(result.verified, false);
});

test('partial evidence with no conflict is not promoted to verified safe', () => {
  const result = summarizeTruckRouteSafety(truck, [{ maxheightM: 5.0 }]);
  assert.equal(result.status, 'NO_CONFLICT_FOUND');
  assert.equal(result.verified, false);
});
