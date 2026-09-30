import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';

function fixture(height, active = false) {
  const fetched = [];
  const state = {
    _enabled: true,
    _viewer: {camera: {positionCartographic: {height}}},
    _cardIds: new Set(['ambient']),
    _activeCameraCardEnabled: active,
    _activeCameraId: 'selected',
    _recordById: new Map(['ambient','selected'].map(id => [id,{camera:{id}}])),
    _cardFetchPendingIds: new Set(),
    _cardFetchInFlightCount: 0,
    _cardLastFetchAt: 0,
  };
  const model = createModel({state,services:{focus:{}},parts:{cards:{
    ensureCardFrameSlot: () => ({stamp:0,nextRetryAt:0}),
    fetchCardFrame: record => fetched.push(record.camera.id),
  }}});
  return {model,state,fetched};
}
test('invisible ambient thumbnails do not fetch at globe altitude; zooming in resumes', () => {
  const f=fixture(26000000);f.model.cardFrameTick();assert.deepEqual(f.fetched,[]);
  f.state._viewer.camera.positionCartographic.height=1800;
  f.model.cardFrameTick();assert.deepEqual(f.fetched,['ambient']);
});
test('explicit selected camera remains eligible at globe altitude', () => {
  const f=fixture(26000000,true);f.model.cardFrameTick();assert.deepEqual(f.fetched,['selected']);
});
