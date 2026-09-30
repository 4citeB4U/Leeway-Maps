import test from 'node:test';
import assert from 'node:assert/strict';
import { requestCloneSpeech, LEEWAY_CLONE_ID } from './cloneVoice.js';

function service({
  identity = {},
  result = {},
  audioType = 'audio/wav',
  afterTts,
} = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/voice-identity'))
        return Response.json({
          voiceId: LEEWAY_CLONE_ID,
          voice_loaded: true,
          engine: 'xtts-v2',
          supportedLanguages: ['en', 'es', 'fr', 'zh-cn'],
          ...identity,
        });
      if (url.endsWith('/tts')) {
        afterTts?.();
        return Response.json({
          status: 'success',
          voice: LEEWAY_CLONE_ID,
          audio_path: '/app/output/agent-lee-test.wav',
          ...result,
        });
      }
      return new Response(new Blob(['test-wave'], { type: audioType }));
    },
  };
}
const endpoint = 'https://voice.example/lee/tts';
test('selected language reaches speech provider and unsupported languages do not synthesize', async () => {
  const s = service();
  await requestCloneSpeech({
    endpoint,
    text: 'Hola',
    language: 'es',
    fetchImpl: s.fetchImpl,
  });
  assert.equal(JSON.parse(s.calls[1].options.body).language, 'es');
  const unavailable = service();
  await assert.rejects(
    requestCloneSpeech({
      endpoint,
      text: 'test',
      language: 'mn',
      fetchImpl: unavailable.fetchImpl,
    }),
    /does not support mn/,
  );
  assert.equal(unavailable.calls.length, 1);
});

test('clone verifies identity before sending text, then fetches the same service audio', async () => {
  const s = service();
  const result = await requestCloneSpeech({
    endpoint,
    text: 'Test route',
    fetchImpl: s.fetchImpl,
  });
  assert.equal(result.voiceId, LEEWAY_CLONE_ID);
  assert.equal(result.blob.type, 'audio/wav');
  assert.deepEqual(
    s.calls.map((c) => c.url),
    [
      'https://voice.example/lee/voice-identity',
      endpoint,
      'https://voice.example/lee/audio/agent-lee-test.wav',
    ],
  );
  assert.equal(JSON.parse(s.calls[1].options.body).voice, LEEWAY_CLONE_ID);
  assert.ok(
    s.calls.every(
      (c) => c.options.credentials === 'omit' && c.options.redirect === 'error',
    ),
  );
});
test('unloaded or different voice fails before any speech request', async () => {
  for (const identity of [
    { voiceId: 'other-voice' },
    { voice_loaded: false },
  ]) {
    const s = service({ identity });
    await assert.rejects(
      requestCloneSpeech({
        endpoint,
        text: 'private route',
        fetchImpl: s.fetchImpl,
      }),
      /not verified/,
    );
    assert.equal(s.calls.length, 1);
  }
});
test('mismatched output voice and unsafe audio references never download', async () => {
  for (const result of [
    { voice: 'other-voice' },
    { audio_path: 'https://elsewhere.example/a.wav' },
    { audio_path: '../a.wav' },
    { audio_path: '/app/output/a.wav?token=abc' },
  ]) {
    const s = service({ result });
    await assert.rejects(
      requestCloneSpeech({ endpoint, text: 'test', fetchImpl: s.fetchImpl }),
    );
    assert.equal(s.calls.length, 2);
  }
});
test('stop during synthesis suppresses the subsequent audio download', async () => {
  const controller = new AbortController();
  const s = service({ afterTts: () => controller.abort() });
  await assert.rejects(
    requestCloneSpeech({
      endpoint,
      text: 'test',
      signal: controller.signal,
      fetchImpl: s.fetchImpl,
    }),
    { name: 'AbortError' },
  );
  assert.equal(s.calls.length, 2);
});
test('non-audio responses and invalid endpoint configurations fail clearly', async () => {
  const s = service({ audioType: 'text/html' });
  await assert.rejects(
    requestCloneSpeech({ endpoint, text: 'test', fetchImpl: s.fetchImpl }),
    /usable audio/,
  );
  await assert.rejects(
    requestCloneSpeech({
      endpoint: 'https://voice.example/wrong',
      text: 'test',
      fetchImpl: s.fetchImpl,
    }),
    /tts endpoint/,
  );
});
