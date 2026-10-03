import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedGeometryRecords,CCTV_GEOMETRY_BUDGET,createGeometryQueue} from './geometryQueue.js';
test('thousands of inventory pins never become thousands of geometry refinements',()=>{
 const rows=Array.from({length:2638},(_,i)=>({camera:{id:String(i),lat:i,mediaCapabilities:{locationOnly:i===2}}}));
 const active=rows[2637];const selected=boundedGeometryRecords(rows,active,r=>r.camera.lat,r=>r.camera.lat<100);
 assert.equal(selected.length,CCTV_GEOMETRY_BUDGET);assert.equal(selected[0],active);
 assert.ok(selected.slice(1).every(r=>r.camera.lat<100&&r!==rows[2]));assert.equal(rows.length,2638);
 const next=boundedGeometryRecords(rows,active,r=>Math.abs(1000-r.camera.lat),r=>r.camera.lat>=990&&r.camera.lat<=1010);
 assert.equal(next.length,22);assert.equal(next[0],active);assert.equal(next[1],rows[1000]);
});
test('empty or metadata-only visible inventory does not schedule unused geometry',()=>{
 assert.deepEqual(boundedGeometryRecords([{camera:{mediaCapabilities:{locationOnly:true}}}],null,()=>0),[]);
 assert.deepEqual(boundedGeometryRecords([{camera:{}}],null,()=>0,()=>false),[]);
});

test('regional refresh progress counts only budgeted work and updates the cohort on a pan',()=>{
 const rows=Array.from({length:2638},(_,i)=>({camera:{id:String(i),lat:i,lon:0}}));let center=0;
 const state={_records:rows,_geoQueue:[],_geoQueueTimer:0,_geoLoading:true,_geoLoadDone:0,_geoLoadTotal:2638,_viewer:{scene:{},camera:{}}};
 const queue=createGeometryQueue({state,services:{},parts:{selection:{getActiveRecord:()=>rows[2637]},navigation:{viewCenterLatLon:()=>({lat:center,lon:0})},model:{haversineKm:(lat,_lon,target)=>Math.abs(lat-target)},presentation:{notifyListeners(){}}}});
 try {
 queue.enqueueGeometryRefresh(rows);assert.equal(state._geoQueue.length,64);assert.equal(state._geoLoadTotal,64);assert.equal(state._geoQueue[1],rows[0]);
 center=1000;queue.enqueueGeometryRefresh(rows);assert.equal(state._geoQueue.length,64);assert.equal(state._geoQueue[0],rows[2637]);assert.equal(state._geoQueue[1],rows[1000]);
 }finally{queue.stopGeometryLoadQueue();}
});
