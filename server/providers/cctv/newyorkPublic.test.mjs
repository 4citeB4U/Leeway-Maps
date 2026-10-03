import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNewYorkSources,normalizeNewYorkPublic,newYorkPublicMedia,NEWYORK_PUBLIC_CAMERAS_URL} from './newyorkPublic.js';
const view={name:'NY 135',url:'https://s7.nysdot.skyvdn.com/rtplive/R10_384/playlist.m3u8',videoPreviewUrl:'https://public.carsprogram.org/cameras/NYSDOT/R10_384.flv.png',broken:false};
const feature={geometry:{type:'Point',coordinates:[-73.49,40.70]},properties:{id:32768,public:true,views:[view]}};
test('current NY public feed preserves official video and snapshot without requesting a key',async()=>{
 const rows=await loadNewYorkSources({env:{},fetchImpl:async(url,options)=>{assert.equal(url,NEWYORK_PUBLIC_CAMERAS_URL);assert.equal(options.redirect,'error');return new Response(JSON.stringify({features:[feature]}));}});
 assert.equal(rows.length,1);assert.equal(rows[0].feedType,'hls');assert.equal(rows[0].snapshotUrl,view.videoPreviewUrl);assert.equal(rows[0].id,'ny511-public-32768-0');
});
test('NY rejects withheld/broken/malformed cameras and hostile media origins',()=>{
 assert.deepEqual(normalizeNewYorkPublic({features:[{...feature,properties:{...feature.properties,public:false}},{...feature,properties:{...feature.properties,views:[{...view,broken:true}]}}]}),[]);
 for(const url of [view.url.replace('s7.nysdot.skyvdn.com','s7.nysdot.skyvdn.com.evil.example'),view.url+'?url=http://localhost',view.url.replace('https://','https://user:secret@')])assert.equal(newYorkPublicMedia(url,true),'');
});
test('unavailable public feed only attempts configured legacy contract and rejects HTML',async()=>{
 const calls=[];const rows=await loadNewYorkSources({env:{NEWYORK_511_API_KEY:'test-only-key'},fetchImpl:async url=>{calls.push(new URL(url));return calls.length===1?new Response('',{status:503}):new Response('<html>new site</html>');}});
 assert.deepEqual(rows,[]);assert.equal(calls.length,2);assert.equal(calls[1].pathname,'/api/v2/get/cameras');
});
