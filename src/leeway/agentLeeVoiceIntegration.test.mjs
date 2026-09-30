import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('Agent Lee delegates voice and keeps deterministic commands before optional model call', async () => {
  const source = await readFile(new URL('./agentLeeGemma.js', import.meta.url), 'utf8');
  assert.match(source, /createVoiceFabricAdapter/);
  assert.doesNotMatch(source, /from ['"].*(?:browserVoice|cloneVoice)|loadBrowserVoiceLibrary|new Audio\(|speechSynthesis/);
  assert.match(source, /fabricVoice\.stop\(\{ mute: !voiceEnabled \}\)/);
  assert.match(source, /fabricVoice\.destroy\(\)/);
  assert.ok(source.indexOf('const systemAction =') < source.indexOf('const phoneResult ='));
});

test('model and voice setup is a keyboard-native button with synchronized disclosure state', async () => {
 const source=await readFile(new URL('./agentLeeGemma.js',import.meta.url),'utf8');
 assert.match(source, /<button[^>]*type="button"[^>]*data-action="setup-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="lal-model-voice-setup"/);
 assert.match(source, /<div id="lal-model-voice-setup" hidden>/);
 let click,expanded='false'; const panel={hidden:true};
 const toggle={addEventListener(type,fn){assert.equal(type,'click');click=fn;},getAttribute(){return expanded;},setAttribute(name,value){assert.equal(name,'aria-expanded');expanded=value;}};
 const root={querySelector:selector=>selector==='[data-action="setup-toggle"]'?toggle:panel};
 const code=source.slice(source.indexOf('  const setupToggle ='),source.indexOf('  const status =',source.indexOf('  const setupToggle =')));
 new Function('root',code)(root);
 click(); assert.equal(expanded,'true');assert.equal(panel.hidden,false);
 click(); assert.equal(expanded,'false');assert.equal(panel.hidden,true);
});

test('personal copilot labels and phone reasoning stay within personal travel', async () => {
 const source=await readFile(new URL('./agentLeeGemma.js',import.meta.url),'utf8');
 assert.match(source,/LEEWAY MAPS · PERSONAL COPILOT/);
 assert.match(source,/Listening… Speak your travel request/);
 assert.doesNotMatch(source,/LEEWAY LOGISTICS|LeeWay Logistics|Speak your logistics request|Never claim truck clearance/);
 assert.match(source,/no company records or commercial dispatch tools/);
});
