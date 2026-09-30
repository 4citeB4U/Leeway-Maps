import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {advanceTrafficDot,createAnimation} from './animation.js';
import {createLifecycle} from './lifecycle.js';

const dotFor=(segments,direction=1,t=0)=>({segmentDist:segments,numSegments:segments.length,segIdx:direction>0?0:segments.length-1,t,direction});
test('movement consumes metres across multiple unequal and zero-length segments in both directions',()=>{
 const forward=dotFor([0.01,0,0.09,10]);
 assert.equal(advanceTrafficDot(forward,1),true);
 assert.equal(forward.segIdx,3);assert.ok(Math.abs(forward.t-0.09)<1e-12);
 const reverse=dotFor([10,0.09,0,0.01],-1,1);
 advanceTrafficDot(reverse,1);assert.equal(reverse.segIdx,0);assert.ok(Math.abs(reverse.t-0.91)<1e-12);
 for(const d of [forward,reverse]) assert.ok(d.t>=0&&d.t<=1);
});
test('road ends recycle in the legal direction and all-zero roads terminate',()=>{
 for(const direction of [1,-1]){
  for(const segments of [[0,0,0],[0.001,0.001]]){
   const d=dotFor(segments,direction,direction>0?0:1);
   advanceTrafficDot(d,100,()=>0.5);
   assert.equal(d.direction,direction);assert.equal(d.segIdx,direction>0?0:segments.length-1);
   assert.equal(d.t,direction>0?0.15:0.85);
  }
 }
});
test('position uploads are capped at 20 Hz while elapsed time and bounded resume are preserved',t=>{
 t.mock.timers.enable({apis:['Date'],now:1000});
 let writes=0;const point={set position(value){writes++;this.last=Cesium.Cartesian3.clone(value);}};
 const dot={...dotFor([1000]),mps:10,point,stoppedUntil:0,waypoints:[new Cesium.Cartesian3(0,0,0),new Cesium.Cartesian3(1000,0,0)]};
 const state={_dots:[dot],_lastAnimTime:0,_scratchLerp:new Cesium.Cartesian3(),_animFrame:0};
 const {animate}=createAnimation({state,parts:{}});
 animate();assert.equal(writes,1);
 for(let i=0;i<10;i++){t.mock.timers.tick(10);animate();}
 assert.equal(writes,3);assert.ok(Math.abs(point.last.x-1.16)<1e-10);
 t.mock.timers.tick(60_000);animate();assert.equal(writes,4);assert.ok(Math.abs(point.last.x-2.16)<1e-10);
});
test('traffic requests timed renders only with animated content and cancels demand on disable',t=>{
 t.mock.timers.enable({apis:['setInterval']});let requests=0,holds=0;
 const event={addEventListener:()=>()=>{},removeEventListener:()=>{}};
 const viewer={scene:{preRender:event,requestRender:()=>requests++},camera:{changed:event,moveEnd:event,percentageChanged:0.5}};
 const state={_dots:[{}],_pointCollection:{},_lastUpdate:1};
 const parts={flow:{ensureFlowStatus(){}},animation:{animate(){},clearDots(){state._dots=[];}},viewport:{onCameraChanged(){}},ingestion:{cancelActiveFetch(){}}};
 const {methods}=createLifecycle({state,parts,services:{render:{holdContinuousRender(){holds++;},releaseContinuousRender(){}}},source:{}});
 methods.enable(viewer);t.mock.timers.tick(100);assert.equal(requests,2);assert.equal(holds,0);
 state._dots=[];t.mock.timers.tick(100);assert.equal(requests,2);
 state._dots=[{}];t.mock.timers.tick(50);assert.equal(requests,3);
 methods.disable(viewer);t.mock.timers.tick(1000);assert.equal(requests,3);
});

test('three minutes of short-road motion keeps all rendered positions finite and on their roads',t=>{
 t.mock.timers.enable({apis:['Date'],now:1000});
 const dots=Array.from({length:32},(_,i)=>{
  const reverse=i%2===1;
  return {...dotFor([0.001,0,0.009,10],reverse?-1:1,reverse?1:0),mps:30,stoppedUntil:0,
   waypoints:[0,0.001,0.001,0.01,10.01].map(x=>new Cesium.Cartesian3(x,0,0)),
   point:{set position(p){assert.ok(Number.isFinite(p.x));assert.ok(p.x>=0&&p.x<=10.01);}}};
 });
 const state={_dots:dots,_lastAnimTime:0,_scratchLerp:new Cesium.Cartesian3(),_animFrame:0};
 const {animate}=createAnimation({state,parts:{}});
 for(let i=0;i<3600;i++){t.mock.timers.tick(50);animate();}
 assert.equal(state._animFrame,3600);
 for(const dot of dots)assert.ok(dot.t>=0&&dot.t<=1);
});
