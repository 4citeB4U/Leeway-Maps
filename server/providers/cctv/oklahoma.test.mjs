import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOklahomaSources,normalizeOklahomaSources,verifiedOklahomaHlsUrl,OKTRAFFIC_CAMERAS_URL} from './oklahoma.js';
const sample={id:1103130967,latitude:'35.39637',longitude:'-97.57406',location:'I-44 & I-240 N',city:'Oklahoma City',type:'Web',status:'Free',blockAtis:'0',direction:'N',streamDictionary:{streamSrc:'https://stream.oktraffic.org/delay-stream/4deafaaa230522fe.stream/playlist.m3u8'}};
test('official public rows preserve video, coordinates, attribution, direction and all statewide entries',()=>{
 const rows=Array.from({length:1200},(_,i)=>({...sample,id:i+1}));
 const result=normalizeOklahomaSources([{mapCameras:rows}]);
 assert.equal(result.length,1200);assert.equal(result[0].feedType,'hls');assert.equal(result[0].snapshotUrl,'');assert.equal(result[0].headingDeg,0);
 assert.equal(result[0].lat,35.39637);assert.match(result[0].mediaLimitation,/delayed/);assert.match(result[0].provider,/Oklahoma/);
});
test('excludes private/blocked/offline/invalid rows and rejects hostile media URLs',()=>{
 const bad=[{type:'Console'},{status:'Out Of Service'},{blockAtis:'1'},{latitude:'0'},{id:'../x'},{streamDictionary:{streamSrc:'https://untrusted.example/video.m3u8'}}];
 assert.equal(normalizeOklahomaSources([{mapCameras:bad.map(x=>({...sample,...x}))}]).length,0);
 for(const url of ['http://stream.oktraffic.org/delay-stream/4deafaaa230522fe.stream/playlist.m3u8',sample.streamDictionary.streamSrc+'?url=http://localhost',sample.streamDictionary.streamSrc.replace('stream.oktraffic.org','stream.oktraffic.org.evil.example'),sample.streamDictionary.streamSrc.replace('https://','https://user:pass@')])assert.equal(verifiedOklahomaHlsUrl(url),'');
});
test('bounded public GET uses exact official filter, no key, and rejects upstream failures',async()=>{
 const rows=await loadOklahomaSources({fetchImpl:async(url,options)=>{
 assert.equal(url,OKTRAFFIC_CAMERAS_URL);assert.equal(options.redirect,'error');assert.ok(options.signal);assert.deepEqual(options.headers,{Accept:'application/json'});
 const filter=JSON.parse(new URL(url).searchParams.get('filter'));assert.equal(filter.include[0].scope.where.type,'Web');
 return new Response(JSON.stringify([{mapCameras:[sample]}]),{headers:{'Content-Type':'application/json'}});
 }});assert.equal(rows[0].id,'oktraffic-1103130967');
 await assert.rejects(loadOklahomaSources({fetchImpl:async()=>new Response('',{status:503})}),/HTTP 503/);
});
