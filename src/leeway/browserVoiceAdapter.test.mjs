import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
function setup(extra = {}) {
  class Worker {
    constructor() {
      this.messages = [];
      Worker.instances.push(this);
    }
    postMessage(m) {
      this.messages.push(m);
    }
    terminate() {
      this.terminated = true;
    }
    reply(id, data) {
      this.onmessage({ data: { id, type: 'complete', data } });
    }
  }
  Worker.instances = [];
  const scope = {
    crypto: webcrypto,
    Worker,
    DOMException,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    URL,
    ...extra,
  };
  vm.createContext(scope);
  vm.runInContext(
    fs.readFileSync(
      __dirname + '/../../public/agent-voice/browser-voice.js',
      'utf8',
    ),
    scope,
  );
  return { Voice: scope.LeeWayBrowserVoice, Worker };
}
test('speaking cannot initiate unsolicited model download', async () => {
  const { Voice, Worker } = setup(),
    voice = new Voice();
  await assert.rejects(voice.speak('Hello.'), /Load the browser voice first/);
  assert.equal(Worker.instances.length, 0);
});
test('automatic voice preparation does not wait for audio activation', async () => {
  let resumed = 0;
  class AudioContext {
    constructor() {
      this.state = 'suspended';
    }
    resume() {
      resumed++;
      return new Promise(() => {});
    }
  }
  const { Voice, Worker } = setup({
      AudioContext,
      fetch: async () => ({
        ok: true,
        blob: async () =>
          new Blob([
            fs.readFileSync(
              __dirname +
                '/../../public/agent-voice/voices/agent-lee-reference.wav',
            ),
          ]),
      }),
    }),
    voice = new Voice();
  voice.setReference = async () => {};
  const loading = voice.load();
  await new Promise((r) => setImmediate(r));
  const worker = Worker.instances[0];
  assert.ok(worker);
  assert.equal(resumed, 0);
  const request = worker.messages.find((m) => m.type === 'load');
  worker.reply(request.id, { device: 'webgpu' });
  await loading;
  assert.equal(voice.ready, true);
  assert.equal(resumed, 0);
});
test('Stop suppresses late generated audio even when inference ignores cancellation', async () => {
  const { Voice } = setup(),
    voice = new Voice();
  voice.ready = true;
  let played = 0;
  voice.play = async () => played++;
  const speech = voice.speak('Hello there.');
  const rejection = assert.rejects(speech, { name: 'AbortError' });
  const worker = voice.worker,
    id = worker.messages.find((m) => m.type === 'generate').id;
  voice.stop();
  worker.reply(id, { audio: new ArrayBuffer(4), sampleRate: 24000 });
  await rejection;
  assert.equal(played, 0);
  assert.equal(voice.pending.size, 0);
});
test('new turn supersedes pending old speech and still plays its own result', async () => {
  const { Voice } = setup(),
    voice = new Voice();
  voice.ready = true;
  let played = 0;
  voice.play = async () => played++;
  const old = voice.speak('Old words.');
  const oldRejected = assert.rejects(old, { name: 'AbortError' });
  const next = voice.speak('New words.');
  const id = voice.worker.messages
    .filter((m) => m.type === 'generate')
    .at(-1).id;
  voice.worker.reply(id, { audio: new ArrayBuffer(4), sampleRate: 24000 });
  await Promise.all([next, oldRejected]);
  assert.equal(played, 1);
  await voice.dispose();
});
test('AbortSignal interrupts speech and dispose releases worker', async () => {
  const { Voice } = setup(),
    voice = new Voice();
  voice.ready = true;
  const controller = new AbortController();
  const speech = voice.speak('Hello.', { signal: controller.signal }),
    rejected = assert.rejects(speech, { name: 'AbortError' });
  controller.abort();
  await rejected;
  const worker = voice.worker;
  await voice.dispose();
  assert.equal(worker.terminated, true);
  assert.equal(voice.ready, false);
});
test('speech chunking preserves text and bounds inference-sized sections', () => {
  const { Voice } = setup(),
    text = Array.from({ length: 100 }, (_, i) => 'word' + i).join(' '),
    parts = Voice.chunks(text);
  assert.equal(parts.join(' '), text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 180 && p.split(' ').length <= 24));
});
test('faster playback preserves pitch, applies pace immediately and releases audio on Stop', async () => {
  let media,
    revoked = 0;
  class Audio {
    constructor(url) {
      media = this;
      this.src = url;
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {
      this.src = '';
    }
    load() {}
  }
  const { Voice } = setup({
      Audio,
      Blob,
      URL: {
        createObjectURL: () => 'blob:test',
        revokeObjectURL: () => revoked++,
      },
    }),
    voice = new Voice();
  const playback = voice.play(
    { audio: new Float32Array([0, 0.2, -0.2]).buffer, sampleRate: 24000 },
    voice.epoch,
  );
  const rejection = assert.rejects(playback, { name: 'AbortError' });
  assert.equal(media.playbackRate, 1.1);
  assert.equal(media.preservesPitch, true);
  voice.setPace(1.2);
  assert.equal(media.playbackRate, 1.2);
  voice.stop();
  await rejection;
  assert.equal(media.paused, true);
  assert.equal(media.src, '');
  assert.equal(revoked, 1);
  assert.equal(voice.sources.size, 0);
});

test('active downloads extend the load deadline but stalled loads still fail', async () => {
  let serial = 0;
  const timers = new Map();
  const { Voice } = setup({
      setTimeout: (fn, ms) => {
        const id = ++serial;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    }),
    voice = new Voice();
  const loading = voice.request('load'),
    failed = assert.rejects(loading, /too long/);
  const worker = voice.worker,
    id = worker.messages[0].id,
    initial = voice.pending.get(id).timer;
  worker.onmessage({ data: { id, type: 'progress', data: { loaded: 100 } } });
  const renewed = voice.pending.get(id).timer;
  assert.notEqual(renewed, initial);
  assert.equal(timers.has(initial), false);
  assert.equal(timers.get(renewed).ms, 900000);
  timers.get(renewed).fn();
  await failed;
  assert.equal(worker.terminated, true);
});
