import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStaticSpatialObservation,STATIC_SPATIAL_DIMENSIONS} from './staticSpatialObservationGate.js';

test('static-spatial contract excludes moving layers and has its own six dimensions',()=>{
 const row=buildStaticSpatialObservation({
  dataManager:{getAll:()=>[
   {id:'transit',enabled:true,stats:{count:100}},
   {id:'transit-routes',enabled:true,stats:{count:25}},
   {id:'transit-stops',enabled:true,stats:{count:40}},
  ]},
  placesOverlay:{getStats:()=>({renderedCount:12})},
  cameraHeightM:1400,frameTimes:[16,18,20],interactionLatencyMs:30,at:1,
 });
 assert.equal(row.contractId,'personal-map-static-spatial-observation-v0');
 assert.deepEqual(row.dimensionOrder,[...STATIC_SPATIAL_DIMENSIONS]);
 assert.deepEqual(row.values,[77,12,2,1400,20,30]);
 assert.equal(row.complete,true);
});

test('static-spatial contract fails closed on missing camera or latency evidence',()=>{
 const row=buildStaticSpatialObservation({
  dataManager:{getAll:()=>[]},placesOverlay:{getStats:()=>({renderedCount:0})},
  cameraHeightM:null,frameTimes:[16],interactionLatencyMs:null,
 });
 assert.equal(row.complete,false);
});
