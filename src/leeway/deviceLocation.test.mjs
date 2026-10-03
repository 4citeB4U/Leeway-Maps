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

test('an invalid fresh response cannot reuse an earlier fix or leave its marker',async()=>{let count=0,removed=0,moves=0;const viewer={entities:{add:x=>x,remove(){removed++;}},scene:{requestRender(){}},camera:{flyTo(){moves++;}}};const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok){ok({coords:{latitude:34.7,longitude:-92.2,accuracy:20},timestamp:++count===1?Date.now():1});}};const api=mountDeviceLocation({viewer,geolocation});await api.recenter();await api.recenter();assert.equal(moves,1);assert.equal(api.getPoint(),null);assert.equal(removed,1);api.destroy();});
test('permission failure remains retryable and success clears its error',async()=>{
 let count=0;const button={dataset:{}};
 const viewer={entities:{add:x=>x,remove(){}},scene:{requestRender(){}},camera:{flyTo(){}}};
 const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok,fail){if(++count===1)fail({code:1});else ok({coords:{latitude:34.7,longitude:-92.2,accuracy:20},timestamp:Date.now()});}};
 const api=mountDeviceLocation({viewer,button,geolocation});await api.recenter();assert.equal(button.dataset.locationError,'1');await api.recenter();assert.equal(button.dataset.locationState,'available');assert.equal(button.dataset.locationError,undefined);api.destroy();
});
test('older overlapping request cannot overwrite a newer fresh fix',async()=>{
 const pending=[];let moves=0;
 const viewer={entities:{add:x=>x,remove(){}},scene:{requestRender(){}},camera:{flyTo(){moves++;}}};
 const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok,fail){pending.push({ok,fail});}};
 const api=mountDeviceLocation({viewer,geolocation});const old=api.recenter(), latest=api.recenter();
 pending[1].ok({coords:{latitude:34.7,longitude:-92.2,accuracy:20},timestamp:Date.now()});await latest;
 pending[0].fail({code:3});await old;assert.equal(api.getPoint().lat,34.7);assert.equal(moves,1);api.destroy();
});

test('device recenter uses navigation ownership facade before camera flight',async()=>{
 const order=[];const viewer={entities:{add:x=>x,remove(){}},scene:{requestRender(){}},camera:{flyTo(){order.push('fly');}}};
 const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok){ok({coords:{latitude:43,longitude:-87,accuracy:80},timestamp:Date.now()});}};
 const api=mountDeviceLocation({viewer,geolocation,navigate:fly=>{order.push('release');return fly();}});await api.recenter();assert.deepEqual(order,['release','fly']);api.destroy();
});
test('refused navigation never flies or reports successful recenter',async()=>{
 const messages=[];const viewer={entities:{add:x=>x,remove(){}},scene:{requestRender(){}},camera:{flyTo(){throw Error('must not fly');}}};
 const geolocation={watchPosition(){return 1;},clearWatch(){},getCurrentPosition(ok){ok({coords:{latitude:43,longitude:-87,accuracy:80},timestamp:Date.now()});}};
 const api=mountDeviceLocation({viewer,geolocation,navigate:()=>false,notify:x=>messages.push(x)});assert.equal(await api.recenter(),false);assert.match(messages.at(-1),/prevented recentering/);api.destroy();
});
