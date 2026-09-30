import test from 'node:test';
import assert from 'node:assert/strict';
import { addLoadCandidate, choiceEvent, parseLoadIntake, validateLoadCandidate } from './loadIntakeCore.js';

const candidate = {
  id: 'offer-a', broker: 'Northstar', pickup: '100 N Main St, Milwaukee, WI 53202',
  delivery: '1 S Pinckney St, Madison, WI 53703', rate: 2800,
};

test('parses editable tender fields and labels uncertain addresses', () => {
  const result = parseLoadIntake(`Broker: Northstar\nLoad ID: AB-9\nPickup:\n100 N Main St\nMilwaukee, WI 53202\nDelivery: 1 S Pinckney St, Madison, WI 53703\nRate: $2,800`);
  assert.equal(result.broker, 'Northstar');
  assert.equal(result.reference, 'AB-9');
  assert.equal(result.pickup, '100 N Main St, Milwaukee, WI 53202');
  assert.equal(result.delivery, '1 S Pinckney St, Madison, WI 53703');
  assert.equal(result.rate, 2800);
  assert.equal(result.extraction.pickup, 'EXTRACTED_REQUIRES_ADDRESS_CONFIRMATION');
});

test('limits the comparison to three independent offers', () => {
  const rows = [0, 1, 2].reduce((all, index) => addLoadCandidate(all, { ...candidate, id: `offer-${index}` }), []);
  assert.equal(rows.length, 3);
  assert.throws(() => addLoadCandidate(rows, { ...candidate, id: 'offer-4' }), /up to three/i);
});

test('creates an internal driver preference, never an external acceptance', () => {
  const event = choiceEvent({ candidate, choice: 'PREFER', reason: 'Appointment fits', actor: 'Driver A' });
  assert.equal(event.externalWrite, false);
  assert.equal(event.choice, 'PREFER');
  assert.equal(event.actor, 'Driver A');
});

test('rejects candidates without confirmed ordinary addresses', () => {
  assert.throws(() => validateLoadCandidate({ ...candidate, pickup: '' }), /pickup street address/i);
});
