import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWisconsin511SourcesFromOpenData} from './sources.js';
test('Wisconsin excludes disabled views and retains every enabled view without leaking key errors',async()=>{
 const previous=globalThis.fetch,oldKey=process.env.WISCONSIN_511_API_KEY,previousWarn=console.warn;const warnings=[];
 process.env.WISCONSIN_511_API_KEY='test-only-not-real-key';console.warn=(...parts)=>warnings.push(parts.join(' '));
 const view=id=>({Id:id,Status:'Enabled',Url:`https://511wi.gov/map/Cctv/${id}`});
 try{
 globalThis.fetch=async()=>new Response(JSON.stringify([{Id:1,Latitude:43.04,Longitude:-87.9,Views:[{...view(1),Status:'Disabled'},view(2),view(3)]}]));
 const rows=await loadWisconsin511SourcesFromOpenData();assert.deepEqual(rows.map(x=>x.id).sort(),['wi511-2','wi511-3']);
 globalThis.fetch=async()=>{throw new Error('URL?key=test-only-not-real-key');};
 await loadWisconsin511SourcesFromOpenData();assert.ok(warnings.length);assert.ok(warnings.every(x=>!x.includes('test-only-not-real-key')));
 }finally{globalThis.fetch=previous;console.warn=previousWarn;if(oldKey===undefined)delete process.env.WISCONSIN_511_API_KEY;else process.env.WISCONSIN_511_API_KEY=oldKey;}
});
