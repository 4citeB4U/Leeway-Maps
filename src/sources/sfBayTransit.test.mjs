import test from 'node:test';
import assert from 'node:assert/strict';
import { PbfWriter } from 'pbf';
import { createTransitService, fetchTransitFeed } from './transitService.js';
import { getTransitFeed, publicTransitCatalog, transitFeedsInRange } from '../data/transitFeeds.js';
import { transitFeedCredit } from '../data/dataCredits.js';
const feed = getTransitFeed('sf-bay-regional');
const key = 'test-only-not-a-real-token';
const request = () => new Request('https://example.test/api/transit/vehicles/sf-bay-regional');
function fixture() {
  const out = new PbfWriter();
  const nested = (parent, tag, write) => { const inner = new PbfWriter(); write(inner); parent.writeBytesField(tag, inner.finish()); };
  nested(out,1,h=>{h.writeStringField(1,'2.0');h.writeVarintField(3,Math.floor(Date.now()/1000));});
  nested(out,2,e=>{e.writeStringField(1,'sample');nested(e,4,v=>{nested(v,2,p=>{p.writeFloatField(1,37.77);p.writeFloatField(2,-122.4);});v.writeVarintField(5,Math.floor(Date.now()/1000));nested(v,8,d=>d.writeStringField(1,'vehicle-1'));});});
  return out.finish();
}
test('SF discovery is regional, catalog contains no credential and attribution has required link', () => {
  assert.ok(transitFeedsInRange(37.77,-122.42).some(f=>f.id===feed.id));
  assert.ok(!transitFeedsInRange(43.04,-87.9).some(f=>f.id===feed.id));
  assert.equal(feed.defaultMode,'unknown');
  assert.ok(!JSON.stringify(publicTransitCatalog()).includes('api_key'));
  assert.match(transitFeedCredit(feed).html, /href="https:\/\/511.org"/);
  assert.match(transitFeedCredit(feed).html, /data provided by 511.org/);
});
test('missing server credential returns honest 503 without contacting provider', async t => {
  let calls=0;const service=createTransitService({env:{},fetchImpl:async()=>{calls++;}});t.after(service.close);
  const response=await service.handle(request());assert.equal(response.status,503);assert.equal(calls,0);assert.match(await response.text(),/credential/);
});
test('server injects key, decodes positions and reuses cache with provider quota TTL', async t => {
  let calls=0;const service=createTransitService({env:{SF_BAY_511_API_KEY:key},fetchImpl:async(url,init)=>{calls++;const endpoint=new URL(url);assert.equal(endpoint.origin,'https://api.511.org');assert.equal(endpoint.searchParams.get('api_key'),key);assert.equal(endpoint.searchParams.get('agency'),'RG');assert.equal(init.redirect,'manual');return new Response(fixture());}});t.after(service.close);
  const response=await service.handle(request());assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes(key));assert.equal(JSON.parse(text).vehicles.length,1);assert.match(response.headers.get('cache-control'),/s-maxage=125/);
  const originalNow=Date.now; const started=originalNow(); t.after(()=>{Date.now=originalNow;});
  Date.now=()=>started+20000;
  assert.equal((await service.handle(request())).status,200);assert.equal(calls,1);
  Date.now=()=>started+126000;
  assert.equal((await service.handle(request())).status,200);assert.equal(calls,2);
});
test('credentialed fetch rejects redirects and sanitizes thrown URL errors', async () => {
  let calls=0;
  await assert.rejects(fetchTransitFeed(feed,null,async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.example/'}});},null,{SF_BAY_511_API_KEY:key}),/redirect rejected/);assert.equal(calls,1);
  await assert.rejects(fetchTransitFeed(feed,null,async()=>{throw new Error(`failed https://api.511.org/?api_key=${key}`);},null,{SF_BAY_511_API_KEY:key}),error=>!error.message.includes(key)&&error.message==='Bay Area transit upstream request failed');
});
