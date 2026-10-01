import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMidwestCameras, loadIowaSourcesFromOpenData, loadMissouriSourcesFromOpenData } from './midwestArcgis.js';
const ia = (overrides = {}) => ({ attributes: { device_id: 12, FID: 123, ImageName: 'Road view', ImageURL: 'https://atmsqf.iowadot.gov/snapshots/Public/Metro/a.jpg', ...overrides }, geometry: { x: -93.5, y: 42 } });
const mo = (overrides = {}) => ({ attributes: { CAM_ID: 4, STREAM_ERROR: 'N', URL2: 'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_337/playlist.m3u8', ...overrides }, geometry: { x: -91.5, y: 38.8 } });
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
test('Iowa retains different views of same device with IDs stable across daily FID changes', () => {
  const first = normalizeMidwestCameras({ features: [ia(), ia({ImageURL: 'https://atmsqf.iowadot.gov/snapshots/Public/Metro/b.jpg'}), ia()] }, 'iowa');
  assert.equal(first.length, 2);
  assert.equal(first[0].id, normalizeMidwestCameras({features:[ia({FID:999})]}, 'iowa')[0].id);
  assert.equal(first[0].ageMinutes, null);
  assert.equal(first[0].feedType, 'image');
});
test('rejects untrusted hosts, URL credentials, unexpected paths and out-of-state coordinates', () => {
  const features = ['https://atmsqf.iowadot.gov.evil.test/snapshots/Public/a.jpg','https://user@atmsqf.iowadot.gov/snapshots/Public/a.jpg','https://atmsqf.iowadot.gov/private/a.jpg','http://atmsqf.iowadot.gov/snapshots/Public/a.jpg'].map(ImageURL=>ia({ImageURL}));
  features.push({...ia(), geometry:{x:0,y:0}});
  assert.deepEqual(normalizeMidwestCameras({features}, 'iowa'), []);
});
test('Missouri publishes only enabled official HLS; ignores indirect and third-party stream URLs', () => {
  const rows = normalizeMidwestCameras({features:[mo(),mo({STREAM_ERROR:'Y'}),mo({URL2:'https://traveler.modot.org/tisvc/api/Tms/CameraStream/name'}),mo({URL2:'https://s2.ozarkstrafficoneview.com/live/a.m3u8'})]}, 'missouri');
  assert.equal(rows.length,1); assert.equal(rows[0].feedType,'hls'); assert.equal(rows[0].snapshotUrl,'');
});
test('loader retrieves all pages without nearest-city truncation and pins upstream requests', async () => {
  const calls=[];
  const rows=await loadIowaSourcesFromOpenData({fetchImpl:async(url,opts)=>{ calls.push(url); assert.equal(opts.redirect,'error'); assert.equal(new URL(url).hostname,'services.arcgis.com'); return json(calls.length===1 ? {features:[ia()],exceededTransferLimit:true} : {features:[ia({device_id:13})]}); }});
  assert.equal(rows.length,2); assert.equal(new URL(calls[1]).searchParams.get('resultOffset'),'1000');
});
test('loader fails honestly on upstream errors, stalled pagination and oversized response', async () => {
  await assert.rejects(loadMissouriSourcesFromOpenData({fetchImpl:async()=>new Response('',{status:503})}),/HTTP 503/);
  await assert.rejects(loadIowaSourcesFromOpenData({fetchImpl:async()=>json({error:{code:403}})}),/unavailable/);
  await assert.rejects(loadIowaSourcesFromOpenData({fetchImpl:async()=>json({features:[],exceededTransferLimit:true})}),/stalled/);
  await assert.rejects(loadIowaSourcesFromOpenData({fetchImpl:async()=>new Response('{}',{headers:{'content-length':'99999999'}})}),/too large/);
});
