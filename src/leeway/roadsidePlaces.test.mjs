import test from 'node:test';
import assert from 'node:assert/strict';
import {roadsideQuery,parseRoadside} from './roadsidePlaces.js';
test('roadside query bounds coordinate input and unknown categories',()=>{
  assert.throws(()=>roadsideQuery('fuel',{lat:99,lon:0}));
  assert.throws(()=>roadsideQuery('injected',{lat:30,lon:0}));
  assert.match(roadsideQuery('weigh',{lat:30,lon:-97}),/around:15000,30.000000,-97.000000/);
});
test('incomplete snapshots rejected and invalid coordinates discarded',()=>{
  assert.throws(()=>parseRoadside({remark:'timeout',elements:[]},'fuel'),/incomplete/);
  const rows=parseRoadside({elements:[{type:'node',id:1,lat:30,lon:-97,tags:{name:'Station'}},{type:'node',id:2,lat:99,lon:0}]},'fuel');
  assert.equal(rows.length,1);assert.equal(rows[0].label,'Station');assert.equal(rows[0].diesel,'not recorded');
});
