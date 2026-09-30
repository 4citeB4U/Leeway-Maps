import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s,c,next) { return s === 'mgrs' ? {url:'test:mgrs',shortCircuit:true} : next(s,c); },
  load(u,c,next) { return u === 'test:mgrs' ? {format:'module',shortCircuit:true,source:'export function forward(){return ""}'} : next(u,c); },
});
const { IntelHUD } = await import('./hud.js');
function fixture(service) {
  globalThis.window = {setTimeout,clearTimeout};
  return Object.assign(Object.create(IntelHUD.prototype), {
    _composeSummary:()=> 'Local map summary', _setSummaryText(text){this.text=text;},
    _latestMetrics:{},_summaryDirty:true,_summaryRevision:0,summaryPolicy:{},
    _summaryContext:async()=>({}),summaryService:{summarize:service},
  });
}
test('overlapping scene updates coalesce context and request work', async()=>{
  let resolveContext, requests=0, contexts=0;
  const hud=fixture(async()=>{requests++;return {ok:false,status:405,data:{}};});
  hud._summaryContext=()=>{contexts++;return new Promise(r=>resolveContext=r);};
  const first=hud._updateSummary();
  await hud._updateSummary();
  assert.equal(contexts,1);
  resolveContext({});await first;
  await hud._updateSummary(false,true);
  assert.equal(requests,1);
  assert.equal(hud.text,'Local map summary');
  assert.equal(hud._summaryBusy,false);
});
test('temporary summary failures back off even when force-refresh is requested',async()=>{
  let requests=0;
  const hud=fixture(async()=>{requests++;return {ok:false,status:503,data:{}};});
  await hud._updateSummary();
  await hud._updateSummary(false,true);
  assert.equal(requests,1);
  assert.ok(hud._summaryRetryAt>Date.now());
  hud._summaryRetryAt=0;
  await hud._updateSummary(false,true);
  assert.equal(requests,2);
});
