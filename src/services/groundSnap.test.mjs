import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {createGroundSnap} from './groundSnap.js';
const position=(lon=0)=>Cesium.Cartesian3.fromDegrees(lon,0,100);
function harness(){
 const calls={terrain:0,gpu:0,exclusions:0,reported:0};
 const scene={globe:{show:true,terrainProvider:{},getHeight:()=>{calls.terrain++;return 27;}},primitives:{length:0},sampleHeight:()=>{calls.gpu++;return 83;}};
 const snap=createGroundSnap({groundFloor:{cachedMeshFloor:()=>null,meshFloorPreferred:()=>true,reportValidatedMeshFloorCell:()=>calls.reported++}});
 return {calls,scene,snap,viewer:{scene},exclusions:()=>{calls.exclusions++;return ['plane'];}};
}
test('visible terrain resolves aircraft without GPU picks, exclusion allocation or mesh-floor contamination',()=>{
 const h=harness();
 for(let i=0;i<64;i++) assert.equal(h.snap.heightFor(h.viewer,String(i),position(i/100),h.exclusions),27);
 assert.deepEqual(h.calls,{terrain:64,gpu:0,exclusions:0,reported:0});
 assert.equal(h.snap.heightFor(h.viewer,'0',position(),h.exclusions),27);assert.equal(h.calls.terrain,64);
});
test('missing terrain stays unavailable, retries with backoff and never falls back to GPU',t=>{
 t.mock.timers.enable({apis:['Date'],now:10000});const h=harness();h.scene.globe.getHeight=()=>{h.calls.terrain++;return undefined;};
 assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),null);
 assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),null);assert.equal(h.calls.terrain,1);
 t.mock.timers.tick(2000);h.scene.globe.getHeight=()=>0;
 assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),0);assert.equal(h.calls.gpu,0);
});
test('map surface and terrain provider changes invalidate cached height even for stationary aircraft',()=>{
 const h=harness();assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),27);
 h.scene.globe.show=false;assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),83);assert.equal(h.calls.exclusions,1);
 h.scene.globe.show=true;h.scene.globe.getHeight=()=>31;assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),31);
 h.scene.globe.terrainProvider={};h.scene.globe.getHeight=()=>44;assert.equal(h.snap.heightFor(h.viewer,'x',position(),h.exclusions),44);
});
test('photoreal host retains four-pick budget, exclusions and no fabricated height on miss',()=>{
 const h=harness();h.scene.globe.show=false;
 for(let i=0;i<4;i++)assert.equal(h.snap.heightFor(h.viewer,String(i),position(i/100),h.exclusions),83);
 assert.equal(h.snap.heightFor(h.viewer,'overflow',position(1),h.exclusions),null);
 assert.equal(h.calls.gpu,4);assert.equal(h.calls.exclusions,4);assert.equal(h.calls.reported,4);
});
