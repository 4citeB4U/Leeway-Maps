import test from 'node:test';
import assert from 'node:assert/strict';
import { readIncomingSharedAddress } from './incomingAddress.js';

test('shared map query becomes a street address for the planner', () => {
  assert.equal(
    readIncomingSharedAddress('?sharedUrl=https%3A%2F%2Fwww.google.com%2Fmaps%2Fsearch%2F%3Fquery%3D600%2BE%2BGrand%2BAve%252C%2BChicago%252C%2BIL'),
    '600 E Grand Ave, Chicago, IL',
  );
});
test('text and title shares use addresses but refuse coordinates', () => {
  assert.equal(readIncomingSharedAddress('?sharedText=50%20Massachusetts%20Ave%20NE%2C%20Washington%2C%20DC'), '50 Massachusetts Ave NE, Washington, DC');
  assert.equal(readIncomingSharedAddress('?sharedText=41.8781%2C-87.6298&sharedTitle=Union%20Station%2C%20Chicago%2C%20IL'), 'Union Station, Chicago, IL');
});
