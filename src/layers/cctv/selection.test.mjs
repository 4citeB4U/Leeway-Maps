import test from 'node:test';
import assert from 'node:assert/strict';
import {createSelection} from './selection.js';
test('a removed selection never falls back to a location-only first regional record',()=>{
 const location={camera:{id:'location-only',mediaCapabilities:{locationOnly:true}}};
 const state={_activeCameraId:'missing-camera',_records:[location],_recordById:new Map([['location-only',location]])};
 const selection=createSelection({state,services:{activation:{},picking:{}},parts:{}});
 assert.equal(selection.getActiveRecord(),null);assert.equal(state._activeCameraId,null);
 state._activeCameraId='location-only';assert.equal(selection.getActiveRecord(),location);
});
