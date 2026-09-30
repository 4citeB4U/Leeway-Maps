import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeAgentLee } from './agent-lee-voice.js';
const voice='LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE';
function service(identity={},result={},audioType='audio/wav') {
 const calls=[]; const bytes=Buffer.from('RIFF0000WAVEdata0000');
 return {calls,fetchImpl:async(url,options={})=>{calls.push({url,options});
  if(url.endsWith('/voice-identity'))return Response.json({voiceId:voice,voice_loaded:true,supportedLanguages:['en','es'],...identity});
  if(url.endsWith('/tts'))return Response.json({status:'success',voice,audio_path:'/app/output/test.wav',...result});
  return new Response(bytes,{headers:{'Content-Type':audioType}});
 }};
}
test('clone proxy verifies identity before text and retains selected language',async()=>{
 const s=service();const result=await synthesizeAgentLee('Hola',{fetchImpl:s.fetchImpl,kernelBase:'https://voice.test',language:'es'});
 assert.equal(result.voiceId,voice);assert.equal(s.calls.length,3);assert.equal(JSON.parse(s.calls[1].options.body).language,'es');
});
test('proxy rejects unsupported language or wrong clone before sending text',async()=>{
 for(const identity of [{voiceId:'wrong'},{voice_loaded:false},{supportedLanguages:['fr']}]) {
  const s=service(identity);await assert.rejects(synthesizeAgentLee('private',{fetchImpl:s.fetchImpl,kernelBase:'https://voice.test'}));assert.equal(s.calls.length,1);
 }
});
test('proxy rejects different output voice and non-audio payload',async()=>{
 const s=service({},{voice:'wrong'});await assert.rejects(synthesizeAgentLee('hello',{fetchImpl:s.fetchImpl}));assert.equal(s.calls.length,2);
 const html=service({}, {}, 'text/html');await assert.rejects(synthesizeAgentLee('hello',{fetchImpl:html.fetchImpl}),/audio/);
});
