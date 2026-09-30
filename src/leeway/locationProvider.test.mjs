import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationProvider,locationError} from './locationProvider.js';
test('web keeps actual browser provider and never calls native or IP service',()=>{
 const browser={}; assert.equal(createLocationProvider({native:false,browser,loadNative:()=>assert.fail()}),browser);
 assert.equal(createLocationProvider({native:false,browser:null}),null);
});
test('native provider preserves position and separates failure reason',async()=>{
 const fix={timestamp:Date.now(),coords:{latitude:34,longitude:-92,accuracy:12}};
 const provider=createLocationProvider({native:true,loadNative:async()=>({getCurrentPosition:async options=>{assert.equal(options.maximumAge,0);return fix;}})});
 const result=await new Promise((resolve,reject)=>provider.getCurrentPosition(resolve,reject,{maximumAge:0}));
 assert.equal(result,fix); assert.equal(locationError({code:'OS-PLUG-GLOC-0003'}).code,1);
 assert.equal(locationError({code:2}).code,2); assert.equal(locationError({code:3}).code,3);
});
test('clear during pending native watch cancels returned subscription and suppresses late fix',async()=>{
 let release,callback; const cleared=[];
 const provider=createLocationProvider({native:true,loadNative:async()=>({watchPosition:(_,cb)=>{callback=cb;return new Promise(resolve=>{release=resolve;});},clearWatch:async({id})=>cleared.push(id)})});
 const id=provider.watchPosition(()=>assert.fail('late fix'));
 await new Promise(resolve=>setTimeout(resolve,0)); provider.clearWatch(id); callback({coords:{}},null);release('native-1');
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(cleared,['native-1']);
});
