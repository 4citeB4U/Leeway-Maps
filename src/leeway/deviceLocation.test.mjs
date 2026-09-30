import test from 'node:test';import assert from 'node:assert/strict';
import {validDeviceFix} from './deviceLocation.js';
test('only current valid device fixes may drive local reports',()=>{
 const p={coords:{latitude:43,longitude:-87,accuracy:12},timestamp:1000000};
 assert.deepEqual(validDeviceFix(p,1001000),{lat:43,lon:-87,accuracy:12,at:1000000});
 assert.equal(validDeviceFix(p,2000000),null);
 assert.equal(validDeviceFix({...p,coords:{...p.coords,latitude:91}},1001000),null);
});
import {mountDeviceLocation} from './deviceLocation.js';
function harness(accuracy=20){let requests=0,moves=[],messages=[];const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok,_fail,options){requests++;assert.equal(options.maximumAge,0);ok({coords:{latitude:34.7465,longitude:-92.2896,accuracy},timestamp:Date.now()});}};const viewer={entities:{add:x=>x,remove(){}},scene:{requestRender(){}},camera:{flyTo:x=>moves.push(x)}};return {api:mountDeviceLocation({viewer,geolocation,notify:x=>messages.push(x)}),moves,messages,requests:()=>requests};}
test('each location press requests a fresh device position, never the map center',async()=>{const h=harness();await h.api.recenter();await h.api.recenter();assert.equal(h.requests(),2);assert.equal(h.moves.length,2);assert.equal(h.api.getPoint().lat,34.7465);h.api.destroy();});
test('a state-sized device estimate cannot move the map as an exact location',async()=>{const h=harness(150000);await h.api.recenter();assert.equal(h.moves.length,0);assert.match(h.messages.at(-1),/approximate location/);h.api.destroy();});
