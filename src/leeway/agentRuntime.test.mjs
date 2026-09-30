import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverModels, prepareModel, runtimeBase } from './agentRuntime.js';
import { PhoneRelay } from './phoneRelay.js';

test('runtime rejects credential-bearing and executable URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://user:secret@example.com',
    'https://example.com/?key=secret',
  ])
    assert.throws(() => runtimeBase(url));
  assert.equal(
    runtimeBase('https://example.com/runtime/'),
    'https://example.com/runtime',
  );
});
test('complete model is reused without a pull', async () => {
  const calls = [];
  const result = await prepareModel({
    endpoint: 'https://runtime.example',
    model: 'gemma4:e4b',
    fetchImpl: async (url) => {
      calls.push(url);
      return Response.json({ models: [{ name: 'gemma4:e4b' }] });
    },
  });
  assert.equal(result.reused, true);
  assert.equal(calls.length, 1);
});
test('pull progress handles split records and verifies inventory afterward', async () => {
  let inventory = 0;
  const progress = [];
  const fetchImpl = async (url) => {
    if (url.endsWith('/api/tags'))
      return Response.json({ models: inventory++ ? [{ name: 'model' }] : [] });
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"status":"down'));
          c.enqueue(
            new TextEncoder().encode(
              'loading","completed":5,"total":10}\n{"status":"success"}',
            ),
          );
          c.close();
        },
      }),
    );
  };
  const result = await prepareModel({
    endpoint: 'https://runtime.example',
    model: 'model',
    fetchImpl,
    onProgress: (p) => progress.push(p),
  });
  assert.equal(result.modelInstalled, true);
  assert.equal(progress[0].completed, 5);
  assert.equal(inventory, 2);
});
test('failed model payload is not promoted as downloaded', async () => {
  await assert.rejects(
    prepareModel({
      endpoint: 'https://runtime.example',
      model: 'missing',
      fetchImpl: async (url) =>
        url.endsWith('/tags')
          ? Response.json({ models: [] })
          : new Response('{"error":"not found"}\n'),
    }),
    /not found/,
  );
});
class Socket {
  static all = [];
  constructor() {
    this.readyState = 1;
    this.sent = [];
    Socket.all.push(this);
  }
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  message(value) {
    this.onmessage({ data: JSON.stringify(value) });
  }
}
test('an authenticated client can recheck when phone comes online without presence broadcasts', async () => {
  const phone = new PhoneRelay({ WebSocketImpl: Socket });
  const connecting = phone.connect(
    'device-123',
    'token-with-twenty-characters',
  );
  const socket = Socket.all.at(-1);
  socket.message({ type: 'hello-ack', phoneOnline: false });
  await connecting;
  const offline = phone.modelStatus();
  socket.message({
    type: 'result',
    id: socket.sent.at(-1).id,
    ok: false,
    error: 'PHONE_OFFLINE',
  });
  await assert.rejects(offline, /PHONE_OFFLINE/);
  assert.equal(phone.phoneOnline, false);
  const online = phone.modelStatus();
  socket.message({
    type: 'result',
    id: socket.sent.at(-1).id,
    ok: true,
    result: { verified: true },
  });
  assert.equal((await online).verified, true);
  assert.equal(phone.phoneOnline, true);
  phone.disconnect();
});
test('phone authenticates exact existing protocol and rejects unverified model', async () => {
  const phone = new PhoneRelay({ WebSocketImpl: Socket });
  const connecting = phone.connect(
    'device-123',
    'token-with-twenty-characters',
  );
  const socket = Socket.all.at(-1);
  socket.onopen();
  assert.equal(socket.sent[0].role, 'client');
  socket.message({ type: 'hello-ack', phoneOnline: true });
  await connecting;
  const answer = phone.infer('Hello');
  const command = socket.sent.at(-1);
  assert.equal(command.capability, 'model.status');
  socket.message({
    type: 'result',
    id: command.id,
    ok: true,
    result: { verified: false },
  });
  await assert.rejects(answer, /not verified/);
  phone.disconnect();
});
test('phone checks nested inference errors and disconnect rejects pending work', async () => {
  const phone = new PhoneRelay({ WebSocketImpl: Socket });
  const connecting = phone.connect(
    'device-123',
    'token-with-twenty-characters',
  );
  const socket = Socket.all.at(-1);
  socket.message({ type: 'hello-ack', phoneOnline: true });
  await connecting;
  const answer = phone.infer('Hello');
  socket.message({
    type: 'result',
    id: socket.sent.at(-1).id,
    ok: true,
    result: { verified: true },
  });
  await Promise.resolve();
  socket.message({
    type: 'result',
    id: socket.sent.at(-1).id,
    ok: true,
    result: { ok: false, error: 'MODEL_FAILED' },
  });
  await assert.rejects(answer, /MODEL_FAILED/);
  const pending = phone.modelStatus();
  phone.disconnect();
  await assert.rejects(pending, /disconnected/);
});
