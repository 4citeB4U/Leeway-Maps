import test from 'node:test';
import assert from 'node:assert/strict';
import { PbfWriter } from 'pbf';
import { mtaRailFeeds, fetchMtaRailVehicles } from './mtaRail.js';
import { createTransitNetworkService } from './transitNetworkService.js';
import { publicTransitCatalog, getTransitFeed } from '../data/transitFeeds.js';
import { buildTransitSelectionCopy } from '../layers/transit/policy.js';
function fixture(now) {
 const out=new PbfWriter();
 const nested=(parent,tag,write)=>{const inner=new PbfWriter();write(inner);parent.writeBytesField(tag,inner.finish());};
 nested(out,1,h=>{h.writeStringField(1,'2.0');h.writeVarintField(3,Math.floor(now/1000));});
 for(const [id,position,age] of [['live',true,5],['old',true,120],['stop-relative',false,5]]) nested(out,2,e=>{
   e.writeStringField(1,id);nested(e,4,v=>{
    if(position)nested(v,2,p=>{p.writeFloatField(1,40.81);p.writeFloatField(2,-73.94);});
    v.writeVarintField(5,Math.floor(now/1000)-age);v.writeStringField(7,'station');
    nested(v,8,d=>d.writeStringField(1,id));v.writeStringField(1001,'MTA extension ignored');
   });
 });return out.finish();
}
test('NYC automatically selects two official railroad feeds; other requested cities do not claim coverage',()=>{
 assert.deepEqual(new Set(mtaRailFeeds(40.75,-73.98).map(f=>f.id)),new Set(['mta-lirr','mta-mnr']));
 assert.equal(mtaRailFeeds(43.04,-87.9).length,0);assert.equal(mtaRailFeeds(41.88,-87.63).length,0);
 assert.ok(publicTransitCatalog().some(f=>f.id==='mta-lirr'));
});
test('protobuf adapter omits old and stop-relative records and never infers GPS',async()=>{
 const now=Date.now();const result=await fetchMtaRailVehicles([getTransitFeed('mta-mnr')],{now,fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).hostname,'api-endpoint.mta.info');assert.equal(options.redirect,'error');return new Response(fixture(now));
 }});
 assert.equal(result.vehicles.length,1);assert.equal(result.vehicles[0].id,'mta-mnr:live');assert.match(result.notice,/Subway arrivals/);
});
test('keyless NYC network endpoint is usable and server-caches the two upstream requests',async()=>{
 let calls=0;const service=createTransitNetworkService({apiKey:'',fetchImpl:async()=>{calls++;return new Response(fixture(Date.now()));}});
 const req={method:'GET',url:'https://app.example/api/transit/network/vehicles?lat=40.75&lon=-73.98'};
 const response=await service.handle(req);assert.equal(response.status,200);const body=await response.json();assert.equal(body.vehicles.length,2);assert.match(body.source,/MTA/);
 await service.handle(req);assert.equal(calls,2);service.close();
});
test('selected delayed MTA train explicitly warns it may not be real time',()=>{
 const now=Date.now();const copy=buildTransitSelectionCopy(getTransitFeed('mta-lirr'),{id:'1',timestamp:(now-70000)/1000},'rail',now);
 assert.match(copy.details.join(' '),/Delayed more than one minute/);
});
