import test from 'node:test';import assert from 'node:assert/strict';
import {readStationPrices,reportStationPrice} from './stationPrices.js';
test('station reports stay separate from regional estimates and preserve timestamp',()=>{
  let content='';const storage={getItem:()=>content,setItem:(_,v)=>{content=v;}};
  const entry=reportStationPrice('node/123',4.199,'diesel',storage,'2026-09-28T00:00:00Z');
  assert.equal(entry.kind,'REPORTED_STATION_PRICE');assert.equal(entry.verified,false);assert.equal(readStationPrices(storage)['node/123'].reportedAt,'2026-09-28T00:00:00Z');
  assert.throws(()=>reportStationPrice('node/123',0,'diesel',storage));assert.throws(()=>reportStationPrice('__proto__',3,'diesel',storage));
});
