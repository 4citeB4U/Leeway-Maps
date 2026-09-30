import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceFabricAdapter, awaitVoiceHandshake, VOICE_FABRIC_HANDSHAKE_MS } from './voiceFabric.js';
test('external clone is selected; mute prevents initialization and has no alternate voice', async () => {
  const calls = [];
  const client = { connect: async()=>{}, selectVoice: async id=>calls.push(id), prepare: async()=>({ready:true,selectedVoiceId:'agent-lee-voice-one'}), speak:async text=>calls.push(text), stop:async()=>{}, destroy(){} };
  const voice = createVoiceFabricAdapter({loadSdk:async()=>({createLeeWayVoice:()=>client})});
  await voice.stop({mute:true}); await voice.speak('muted'); assert.deepEqual(calls,[]);
  voice.resume(); await voice.speak('route ready'); assert.deepEqual(calls,['agent-lee-voice-one','route ready']);
});
test('wrong voice rejects instead of substituting device speech',async()=>{
 const voice=createVoiceFabricAdapter({loadSdk:async()=>({createLeeWayVoice:()=>({connect:async()=>{},selectVoice:async()=>{},prepare:async()=>({ready:true,selectedVoiceId:'other'}),destroy(){}})})});
 await assert.rejects(voice.speak('hello'),/Voice One/);
});

test('canonical preparation timeout and bridge progress/errors reach the UI and listeners detach', async () => {
 const states=[], events=new Map(); let options, destroyed=false;
 const client={
  on(type,fn){events.set(type,fn);return()=>events.delete(type);},
  connect:async()=>{},selectVoice:async()=>{},
  prepare:async()=>{events.get('voice.state')({message:'Loading voice model 42%'});return{ready:true,selectedVoiceId:'agent-lee-voice-one'};},
  speak:async()=>{throw new Error('Audio playback blocked');},stop:async()=>{},destroy(){destroyed=true;},
 };
 const voice=createVoiceFabricAdapter({loadSdk:async()=>({createLeeWayVoice:opts=>{options=opts;return client;}}),onState:s=>states.push(s)});
 await voice.prepare();
 assert.equal(options.timeoutMs,900000);
 assert.equal(VOICE_FABRIC_HANDSHAKE_MS,120000);
 assert.ok(states.some(s=>/1.5 GB/.test(s.message||'') && /15 minutes/.test(s.message)));
 assert.ok(states.some(s=>/Selecting Agent Lee Voice One/.test(s.message||'')));
 assert.ok(states.some(s=>s.message==='Loading voice model 42%'));
 events.get('voice.error')({message:'Engine unavailable'});
 assert.equal(states.at(-1).status,'unavailable');
 await assert.rejects(voice.speak('Hello'),/playback blocked/);
 assert.equal(states.at(-1).message,'Audio playback blocked');
 await voice.stop({mute:true});
 const count=states.length;
 events.get('voice.state')({message:'late engine progress'});
 assert.equal(states.length,count);
 voice.destroy(); assert.equal(events.size,0); assert.equal(destroyed,true);
});

test('disconnect during SDK load cannot resurrect an iframe or invalidate a newer connection', async () => {
 let resolveOld,loads=0,creations=0,destroys=0;
 const client={connect:async()=>{},selectVoice:async()=>{},prepare:async()=>({ready:true,selectedVoiceId:'agent-lee-voice-one'}),destroy(){destroys++;}};
 const sdk={createLeeWayVoice(){creations++;return client;}};
 const voice=createVoiceFabricAdapter({loadSdk:()=>++loads===1?new Promise(r=>resolveOld=r):Promise.resolve(sdk)});
 const old=voice.prepare();
 const rejection=assert.rejects(old,{name:'AbortError'});
 voice.destroy();
 await voice.prepare();
 resolveOld(sdk); await rejection;
 assert.equal(creations,1);assert.equal(destroys,0);
 assert.equal(await voice.prepare(),client);
});

test('bounded handshake rejects timeout and cancels promptly without awaiting cold load', async () => {
 await assert.rejects(awaitVoiceHandshake(new Promise(()=>{}),'voice selection',undefined,5),/voice selection timed out/);
 const controller=new AbortController();
 const wait=awaitVoiceHandshake(new Promise(()=>{}),'connection',controller.signal);
 const rejection=assert.rejects(wait,{name:'AbortError'});
 controller.abort(); await rejection;
 assert.equal(await awaitVoiceHandshake(Promise.resolve('connected'),'connection'), 'connected');
});

test('disconnect during long preparation releases subscriptions and does not announce ready later', async () => {
 let resolvePrepare,started; const reached=new Promise(r=>started=r); const events=new Map(); const states=[];let destroyed=false;
 const client={on(type,fn){events.set(type,fn);return()=>events.delete(type);},connect:async()=>{},selectVoice:async()=>{},prepare(){started();return new Promise(r=>resolvePrepare=r);},destroy(){destroyed=true;}};
 const voice=createVoiceFabricAdapter({loadSdk:async()=>({createLeeWayVoice:()=>client}),onState:s=>states.push(s)});
 const pending=voice.prepare();const rejection=assert.rejects(pending,{name:'AbortError'});
 await reached;voice.destroy();assert.equal(events.size,0);assert.equal(destroyed,true);
 resolvePrepare({ready:true,selectedVoiceId:'agent-lee-voice-one'});await rejection;
 assert.equal(states.some(s=>s.status==='ready'),false);
});
