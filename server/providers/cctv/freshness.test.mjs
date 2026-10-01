import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSourceItem } from './normalize.js';
test('missing camera observation age never becomes a fresh zero-minute observation',()=>{
 for(const age of [undefined,null,'']) {const row=normalizeSourceItem({id:'camera',lat:35,lon:-97,ageMinutes:age});assert.equal(row.ageMinutes,null);}
 assert.equal(normalizeSourceItem({id:'camera',lat:35,lon:-97,ageMinutes:0}).ageMinutes,0);
});
