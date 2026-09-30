import test from 'node:test';
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
