import test from 'node:test';
import assert from 'node:assert/strict';
import {MINNESOTA_FEATURED_URL,loadMinnesotaFeaturedSources,normalizeMinnesotaFeatured,verifiedMinnesotaImage} from './minnesota.js';
const row={title:'I-35 Rush City MP157 View1',uri:'camera/504132/783196578',url:'https://public.carsprogram.org/cameras/MN/C30301-v1?1790827560000',parentCollection:{bbox:[-92.99218,45.64289,-92.99218,45.64289]}};
const body=rows=>({data:{dashboardQuery:{cameraViewsPayload:{cameraViews:rows}}}});
test('featured pack uses explicit public image and reports partial snapshot capability',()=>{
 const rows=normalizeMinnesotaFeatured(body([row,row]));assert.equal(rows.length,1);
 assert.equal(rows[0].id,'mn-featured-504132-783196578');assert.equal(rows[0].url,row.url);
 assert.equal(rows[0].feedType,'image');assert.match(rows[0].mediaLimitation,/not statewide/);
});
test('invalid geometry, unrelated URLs and credentials never become camera sources',()=>{
 assert.deepEqual(normalizeMinnesotaFeatured(body([{...row,parentCollection:{bbox:[0,0,0,0]}},{...row,uri:'private/1'},{...row,url:'https://example.com/frame'}])),[]);
 for(const url of [row.url.replace('public.carsprogram.org','public.carsprogram.org.evil.example'),row.url.replace('/MN/','/IA/'),row.url.replace('https://','http://'),row.url.replace('https://','https://user:secret@'),row.url+'&url=http://localhost'])assert.equal(verifiedMinnesotaImage(url),'');
});
test('fetch uses bounded official read-only query and rejects provider GraphQL errors',async()=>{
 const rows=await loadMinnesotaFeaturedSources({fetchImpl:async(url,options)=>{
 assert.equal(url,MINNESOTA_FEATURED_URL);assert.equal(options.redirect,'error');assert.ok(options.signal);
 return new Response(JSON.stringify(body([row])));
 }});assert.equal(rows.length,1);
 await assert.rejects(loadMinnesotaFeaturedSources({fetchImpl:async()=>new Response(JSON.stringify({errors:[{message:'denied'}]}))}),/query unavailable/);
});
