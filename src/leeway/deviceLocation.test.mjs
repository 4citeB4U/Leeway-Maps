import test from 'node:test';import assert from 'node:assert/strict';
import {validDeviceFix} from './deviceLocation.js';
test('only current valid device fixes may drive local reports',()=>{
 const p={coords:{latitude:43,longitude:-87,accuracy:12},timestamp:1000000};
 assert.deepEqual(validDeviceFix(p,1001000),{lat:43,lon:-87,accuracy:12,at:1000000});
 assert.equal(validDeviceFix(p,2000000),null);
 assert.equal(validDeviceFix({...p,coords:{...p.coords,latitude:91}},1001000),null);
});
