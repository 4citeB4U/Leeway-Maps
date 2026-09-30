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
