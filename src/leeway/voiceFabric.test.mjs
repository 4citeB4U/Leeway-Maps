import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceFabricAdapter } from './voiceFabric.js';
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
