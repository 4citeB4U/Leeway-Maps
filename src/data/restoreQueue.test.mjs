import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestoreQueue } from './restoreQueue.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('startup admission caps concurrent layers at two and retains every selection',async()=>{
  const run=createRestoreQueue(2), gates=Array.from({length:6},deferred), started=[];
  let active=0,max=0;
  const jobs=gates.map((gate,i)=>run(async()=>{started.push(i);active++;max=Math.max(max,active);await gate.promise;active--;return i;}));
  await Promise.resolve();assert.deepEqual(started,[0,1]);
  for(let i=0;i<6;i++){gates[i].resolve();await new Promise(r=>setTimeout(r,0));}
  assert.deepEqual(await Promise.all(jobs),[0,1,2,3,4,5]);assert.equal(max,2);
});
test('explicit navigation cancels queued initialization; rejection does not block remaining layers',async()=>{
  const run=createRestoreQueue(1),gate=deferred(),controller=new AbortController();let called=false;
  const first=run(()=>gate.promise);
  const cancelled=run(()=>{called=true;},controller.signal);
  const assertion=assert.rejects(cancelled,{name:'AbortError'});
  const failed=run(()=>{throw Error('provider failed');});const failure=assert.rejects(failed,/provider failed/);
  const last=run(()=>42);controller.abort();gate.resolve();await first;await assertion;await failure;
  assert.equal(called,false);assert.equal(await last,42);
});
