import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpatialMeasurement } from './spatialMeasurementGate.js';

test('spatial measurement emits the Formula dimension order only when evidence is finite', () => {
  const dataManager = {
    getAll() {
      return [
        { id:'transit', enabled:true, stats:{
          count:20, movingCount:4, mapMatchMeanDeviationM:7.5,
        }},
        { id:'flights', enabled:true, stats:{count:10}},
      ];
    },
  };
  const row = buildSpatialMeasurement({
    dataManager,
    placesOverlay:{ getStats:()=>({renderedCount:8}) },
    frameTimes:[16,17,18,20],
    interactionLatencyMs:32,
    at:1,
  });
  assert.equal(row.complete, true);
  assert.deepEqual(row.values, [30,14,7.5,8,20,32]);
});

test('missing route deviation blocks Formula-ready measurement instead of becoming zero', () => {
  const row = buildSpatialMeasurement({
    dataManager:{getAll:()=>[{id:'transit',enabled:true,stats:{count:1,movingCount:1}}]},
    placesOverlay:{getStats:()=>({renderedCount:1})},
    frameTimes:[16],
    interactionLatencyMs:20,
  });
  assert.equal(row.complete, false);
  assert.equal(row.values[2], null);
});
