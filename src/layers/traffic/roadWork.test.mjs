import test from 'node:test';
import {createModel} from './model.js';
import * as Cesium from 'cesium';
import {DOT_HEIGHT_OFFSET} from './policy.js';
import assert from 'node:assert/strict';
import {materializeTrafficRoads,sampleTrafficHeight} from './roadWork.js';
test('large road loads yield after at most four roads, preserving every record',async()=>{
 const roads=Array.from({length:101},(_,id)=>({id}));let batch=0,max=0,yields=0;
 const result=await materializeTrafficRoads({roads},data=>{max=Math.max(max,++batch);return data.roads;},{now:()=>0,yieldTask:async()=>{yields++;batch=0;}});
 assert.deepEqual(result,roads);assert.equal(max,4);assert.equal(yields,25);
});
test('slow height reads yield after one road, not a whole batch',async()=>{
 let clock=0,parsed=0,yields=0;
 await materializeTrafficRoads({roads:[1,2,3]},data=>{parsed++;clock+=12;return data.roads;},{now:()=>clock,yieldTask:async()=>{assert.equal(parsed,++yields);}});
 assert.equal(yields,3);
});
test('disable and superseded views cancel between slices before results can commit',async()=>{
 for(const cancelBySignal of [true,false]){
  const controller=new AbortController();let current=true,parsed=0,committed=false;
  await assert.rejects(async()=>{const result=await materializeTrafficRoads({roads:Array(20).fill(1)},data=>{parsed++;return data.roads;},{signal:controller.signal,isCurrent:()=>current,now:()=>0,yieldTask:async()=>{if(cancelBySignal)controller.abort();else current=false;}});committed=!!result;},{name:'AbortError'});
  assert.equal(parsed,4);assert.equal(committed,false);
 }
});
test('height cache shares exact road starts only within one load and never caches misses',()=>{
 let calls=0;const scene={sampleHeight:()=>{calls++;return 40;}};const point={longitude:1,latitude:2};const cache=new Map();
 assert.equal(sampleTrafficHeight(scene,point,cache),40);assert.equal(sampleTrafficHeight(scene,point,cache),40);assert.equal(calls,1);
 sampleTrafficHeight(scene,point,new Map());assert.equal(calls,2);
 const misses=new Map();sampleTrafficHeight({sampleHeight:()=>undefined},point,misses);assert.equal(misses.size,0);
});


test('visible globe uses loaded terrain without any synchronous GPU scene picks', async () => {
 let terrainCalls=0, gpuCalls=0;
 const scene={globe:{show:true,getHeight:()=>{terrainCalls++;return 27;}},
  sampleHeightSupported:true,sampleHeight:()=>{gpuCalls++;throw new Error('GPU pick forbidden');}};
 const cache=new Map();
 const roads=Array.from({length:1000},(_,longitude)=>({longitude,latitude:0}));
 const result=await materializeTrafficRoads({roads},data=>data.roads.map(point=>sampleTrafficHeight(scene,point,data.groundHeightCache)),
  {heightCache:cache,now:()=>0,yieldTask:async()=>{}});
 assert.equal(result.length,1000);assert.ok(result.every(h=>h===27));
 assert.equal(terrainCalls,1000);assert.equal(gpuCalls,0);
 assert.equal(sampleTrafficHeight(scene,roads[0],cache),27);assert.equal(terrainCalls,1000);
});

test('unloaded globe terrain remains a miss without falling back to GPU picks',()=>{
 const cache=new Map();let gpuCalls=0;
 const scene={globe:{show:true,getHeight:()=>undefined},sampleHeightSupported:true,sampleHeight:()=>{gpuCalls++;return 999;}};
 assert.equal(sampleTrafficHeight(scene,{longitude:1,latitude:2},cache),undefined);
 assert.equal(cache.size,0);assert.equal(gpuCalls,0);
 // CPU terrain remains available on devices without depth-texture picking.
 scene.sampleHeightSupported=false;scene.globe.getHeight=()=>0;
 assert.equal(sampleTrafficHeight(scene,{longitude:1,latitude:2},cache),0);
});

test('hidden globe preserves scene surface sampling for 3D tile hosts',()=>{
 let gpuCalls=0;
 const scene={globe:{show:false,getHeight:()=>{throw new Error('Hidden globe must not replace rendered mesh height');}},
  sampleHeightSupported:true,sampleHeight:()=>{gpuCalls++;return 83;}};
 assert.equal(sampleTrafficHeight(scene,{longitude:1,latitude:2},new Map()),83);
 assert.equal(gpuCalls,1);
 scene.sampleHeightSupported=false;
 assert.equal(sampleTrafficHeight(scene,{longitude:1,latitude:2},new Map()),undefined);
 assert.equal(gpuCalls,1);
});


test('road materialization keeps finite ellipsoid fallback when globe terrain is not loaded',()=>{
 const scene={globe:{show:true,getHeight:()=>undefined},sampleHeightSupported:true,
  sampleHeight:()=>{throw new Error('Unexpected GPU pick');}};
 const model=createModel({state:{_viewer:{scene}},parts:{}});
 const roads=model.parseRoads({roads:[{coordinates:[[-0.13,51.5],[-0.129,51.501]],type:'residential'}],groundHeightCache:new Map()});
 assert.equal(roads.length,1);
 for(const position of roads[0].waypoints){
  const height=Cesium.Cartographic.fromCartesian(position).height;
  assert.ok(Number.isFinite(height));assert.ok(Math.abs(height-DOT_HEIGHT_OFFSET)<1e-6);
 }
 scene.globe.getHeight=()=>37;scene.sampleHeightSupported=false;
 const terrainRoads=model.parseRoads({roads:[{coordinates:[[-0.13,51.5],[-0.129,51.501]],type:'residential'}]});
 assert.ok(Math.abs(Cesium.Cartographic.fromCartesian(terrainRoads[0].waypoints[0]).height-(37+DOT_HEIGHT_OFFSET))<1e-6);
});
