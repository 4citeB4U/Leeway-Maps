import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraSourceAccess,emptyCameraCoverageText} from './cameraCoverageStatus.js';
import {createPresentation} from '../layers/cctv/presentation.js';

test('connected, credential-blocked and official-site-only networks remain distinct',()=>{
 assert.match(cameraSourceAccess({integrationStatus:'integrated'}).message,/individual cameras may be offline/);
 assert.match(cameraSourceAccess({integrationStatus:'key-required',requiredCredential:'EXAMPLE_511_API_KEY'}).message,/EXAMPLE_511_API_KEY/);
 const restricted=cameraSourceAccess({integrationStatus:'permission-required',sourceUrl:'https://www.algotraffic.com/cameras'});
 assert.match(restricted.message,/Official-site access only/);
 assert.deepEqual(restricted.links,[{label:'Official source',href:'https://www.algotraffic.com/cameras'}]);
 assert.match(cameraSourceAccess({integrationStatus:'metadata-integrated'}).message,/media is not connected/);
});
test('source links accept HTTPS only, reject embedded credentials and deduplicate documentation',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,x','http://example.com','https://user:secret@example.com','bad'])
  assert.deepEqual(cameraSourceAccess({sourceUrl:url}).links,[]);
 assert.equal(cameraSourceAccess({sourceUrl:'https://example.com/',documentationUrl:'https://example.com/'}).links.length,1);
});
test('empty regional coverage is not described as absence of cameras or a live outage',()=>{
 assert.match(emptyCameraCoverageText({totalCount:4000,scopedCount:0}),/does not mean the area has no cameras/);
 assert.match(emptyCameraCoverageText({totalCount:0}),/No camera records loaded/);
 assert.match(emptyCameraCoverageText({error:'HTTP 503'}),/could not be loaded/);
 const presentation=createPresentation({state:{_records:[{}],_lastError:null},parts:{selection:{getActiveRecord:()=>null},navigation:{scopedRecordsNearViewer:()=>[]}}});
 assert.match(presentation.buildSummaryText(),/No connected cameras in this map area/);
});

test('registry can supply the official homepage link label without changing access status',()=>{
 const source=cameraSourceAccess({integrationStatus:'permission-required',sourceUrl:'https://www.idrivearkansas.com/',linkLabel:'Traveler information'});
 assert.equal(source.links[0].label,'Traveler information');
 assert.match(source.message,/embedded camera media is not enabled/);
});
