import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCameraScope, selectRegionalCameras } from './regionalCatalog.js';
import { createCctvCatalog } from './catalog.js';

test('regional query validates coordinates and bounded request size', () => {
  assert.equal(parseCameraScope(new URLSearchParams()), null);
  for (const query of ['lat=91&lon=0','lat=&lon=0','lat=0','lat=0&lon=0&radiusKm=1001','lat=0&lon=0&limit=4001'])
    assert.throws(() => parseCameraScope(new URLSearchParams(query)), {statusCode:400});
  assert.equal(parseCameraScope(new URLSearchParams('lat=35&lon=-97')).limit,4000);
});
test('a local camera cannot be lost behind thousands of distant cameras', () => {
  const rows = Array.from({length:5000},(_,i)=>({id:`distant-${i}`,lat:51,lon:0}));
  rows.push({id:'ok',lat:35.4,lon:-97.5},{id:'ia',lat:41.6,lon:-93.6});
  const result=selectRegionalCameras(rows,{lat:35.4,lon:-97.5,radiusKm:180,limit:4000});
  assert.deepEqual(result.sources.map(x=>x.id),['ok']);
  assert.equal(result.scope.totalAvailable,5002);
  assert.equal(result.scope.truncated,false);
});
test('selected distant video remains pinned within the same budget', () => {
  const rows=[{id:'near',lat:0,lon:0},{id:'far',lat:60,lon:60}];
  const result=selectRegionalCameras(rows,{lat:0,lon:0,radiusKm:1,limit:1,includeId:'far'});
  assert.deepEqual(result.sources.map(x=>x.id),['far']);
  assert.equal(result.scope.matchedCount,1);
  assert.equal(result.scope.truncated,true);
});
test('catalog retains uncapped provider inventory for map-region queries', async () => {
  const previous=process.env.CCTV_FORCE_AUSTIN;
  process.env.CCTV_FORCE_AUSTIN='1';
  try {
    const rows=Array.from({length:4100},(_,i)=>({id:`distant-${i}`,lat:51,lon:0}));
    rows.push({id:'regional-ok',lat:35.4,lon:-97.5});
    const catalog=createCctvCatalog({sourceRoot:'/nonexistent-camera-test',livePacks:[{name:'test',enabled:()=>true,load:async()=>rows}]});
    assert.ok((await catalog()).length<=4000);
    const result=await catalog.query({lat:35.4,lon:-97.5,radiusKm:180,limit:4000});
    assert.deepEqual(result.sources.map(x=>x.id),['regional-ok']);
  } finally { if(previous===undefined) delete process.env.CCTV_FORCE_AUSTIN; else process.env.CCTV_FORCE_AUSTIN=previous; }
});
