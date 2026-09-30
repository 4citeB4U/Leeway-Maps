import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  createPeerTicket,
  verifyPeerTicket,
  createPeerSignalingStore,
  createPeerSignalingHandler,
  peerSignalingPlugin,
  hashPeerPassword,
} from './peerSignaling.js';

const secret = 'test-only-secret-never-deployed-123456789';
const account = (subject, org = 'fleet') => ({
  subject,
  org,
  role: 'driver',
  displayName: subject,
});
const user = (subject, org = 'fleet', now = Date.now()) =>
  verifyPeerTicket(
    createPeerTicket(account(subject, org), secret, { now }),
    secret,
    now,
  );

test('signed identity rejects tampering, expired tickets and excessive lifetime', () => {
  const ticket = createPeerTicket(account('a'), secret, { now: 1000000 });
  const company = verifyPeerTicket(ticket, secret, 1000000);
  assert.equal(company.sub, 'a');
  assert.equal(company.directoryPolicy, 'company');
  const personal = verifyPeerTicket(
    createPeerTicket({ ...account('p'), directoryPolicy: 'opt-in' }, secret, {
      now: 1000000,
    }),
    secret,
    1000000,
  );
  assert.equal(personal.directoryPolicy, 'opt-in');
  assert.throws(() => verifyPeerTicket(`${ticket}x`, secret, 1000000), {
    status: 401,
  });
  assert.throws(() => verifyPeerTicket(ticket, secret, 2000000), {
    status: 401,
  });
  assert.throws(
    () =>
      verifyPeerTicket(
        ticket,
        'other-secret-01234567890123456789012345',
        1000000,
      ),
    { status: 401 },
  );
});

test('mutual consent, tenant isolation, scoped signals, expiry and snapshot round trip', () => {
  let time = 1000000;
  const store = createPeerSignalingStore({ now: () => time });
  const a = user('a', 'fleet', time),
    b = user('b', 'fleet', time),
    c = user('c', 'other', time);
  store.act(b, 'presence', { discoverable: true });
  store.act(c, 'presence', { discoverable: true });
  assert.deepEqual(
    store.act(a, 'directory').peers.map((row) => row.id),
    ['b'],
  );
  assert.throws(() => store.act(c, 'invite', { to: 'b', media: 'text' }), {
    status: 404,
  });
  assert.throws(
    () =>
      store.act(a, 'signal', { sessionId: 'not-accepted', candidate: null }),
    { status: 404 },
  );
  const { inviteId } = store.act(a, 'invite', { to: 'b', media: 'text' });
  assert.equal(store.act(a, 'inbox').events.length, 0);
  assert.equal(store.act(b, 'inbox').events[0].from.id, 'a');
  assert.throws(() => store.act(a, 'respond', { inviteId, accept: true }), {
    status: 404,
  });
  const { sessionId } = store.act(b, 'respond', { inviteId, accept: true });
  assert.equal(store.act(a, 'inbox').events[0].inviteId, inviteId);
  assert.throws(() => store.act(c, 'signal', { sessionId, candidate: null }), {
    status: 404,
  });
  assert.throws(
    () =>
      store.act(a, 'signal', {
        sessionId,
        description: { type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111' },
      }),
    { status: 403 },
  );
  store.act(a, 'signal', {
    sessionId,
    description: {
      type: 'offer',
      sdp: 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    },
  });
  store.act(b, 'signal', {
    sessionId,
    description: {
      type: 'answer',
      sdp: 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    },
  });
  const restored = createPeerSignalingStore({ now: () => time });
  restored.importState(JSON.parse(JSON.stringify(store.exportState())));
  assert.ok(
    restored
      .act(b, 'inbox')
      .events.some((row) => row.description?.type === 'offer'),
  );
  restored.act(a, 'hangup', { sessionId });
  assert.throws(
    () => restored.act(a, 'signal', { sessionId, candidate: null }),
    { status: 404 },
  );
  time += 90001;
  assert.equal(store.act(a, 'directory').peers.length, 0);
  time += 900000;
  assert.throws(() => store.act(a, 'signal', { sessionId, candidate: null }), {
    status: 404,
  });
});

test('real password login, unauthorized reads, login throttle and Vercel fail closed', async (t) => {
  const salt = '0123456789abcdef0123456789abcdef';
  const accounts = {
    schemaVersion: 1,
    users: [
      {
        ...account('alice'),
        username: 'alice',
        salt,
        passwordHash: await hashPeerPassword('fixture-password-only', salt),
      },
    ],
  };
  const env = {
    LEEWAY_PEER_SIGNALING_ENABLED: '1',
    LEEWAY_PEER_SIGNING_SECRET: secret,
    LEEWAY_PEER_USERS_JSON: JSON.stringify(accounts),
  };
  const server = createServer(createPeerSignalingHandler({ env }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api/peers`;
  assert.equal((await fetch(`${base}/me`)).status, 401);
  const login = (password) =>
    fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password }),
    });
  assert.equal((await login('wrong')).status, 401);
  const reply = await login('fixture-password-only');
  assert.equal(reply.status, 200);
  const receipt = await reply.json();
  assert.equal(receipt.user.id, 'alice');
  const me = await fetch(`${base}/me`, {
    headers: { Authorization: `Bearer ${receipt.ticket}` },
  });
  const signedIn = (await me.json()).user;
  assert.equal(signedIn.role, 'driver');
  assert.equal(signedIn.directoryPolicy, 'company');
  for (let i = 0; i < 3; i++) await login('wrong');
  assert.equal((await login('wrong')).status, 429);
  const disabled = createServer(
    createPeerSignalingHandler({ env: { ...env, VERCEL: '1' } }),
  );
  await new Promise((resolve) => disabled.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    disabled.closeAllConnections();
    disabled.close();
  });
  const status = await fetch(
    `http://127.0.0.1:${disabled.address().port}/api/peers/status`,
  );
  assert.equal((await status.json()).available, false);
});

test('Vite plugin installs without returning Connect dispatcher', () => {
  const plugin = peerSignalingPlugin({ env: {} });
  const server = {
    middlewares: {
      use() {
        return () => {};
      },
    },
  };
  assert.equal(plugin.configureServer(server), undefined);
  assert.equal(plugin.configurePreviewServer(server), undefined);
});

test('operator CLI writes only salted hash and rejects duplicate identities', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leeway-peer-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'users.json');
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          'scripts/provision-peer-user.mjs',
          '--file',
          path,
          '--username',
          'fixture',
          '--subject',
          'fixture-id',
          '--org',
          'test-only',
          '--role',
          'driver',
          '--name',
          'Test Fixture',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      child.on('error', reject);
      child.on('close', resolve);
      child.stdin.end('fixture-password-only\n');
    });
  assert.equal(await run(), 0);
  const content = await readFile(path, 'utf8');
  assert.equal(content.includes('fixture-password-only'), false);
  const row = JSON.parse(content).users[0];
  assert.equal(
    row.passwordHash,
    await hashPeerPassword('fixture-password-only', row.salt),
  );
  assert.equal(await run(), 1);
});

test('blocking ends accepted media, purges pending signals and survives restore and expiry', () => {
  let time = 1000000;
  const store = createPeerSignalingStore({ now: () => time });
  const a = user('a', 'public', time),
    b = user('b', 'public', time),
    c = user('a', 'business', time);
  for (const u of [a, b, c]) store.act(u, 'presence', { discoverable: true });
  const invitation = store.act(a, 'invite', { to: 'b', media: 'audio' });
  const { sessionId } = store.act(b, 'respond', {
    inviteId: invitation.inviteId,
    accept: true,
  });
  store.act(a, 'signal', { sessionId, candidate: null });
  store.act(b, 'block', { to: 'a' });
  assert.throws(() => store.act(a, 'signal', { sessionId, candidate: null }), {
    status: 404,
  });
  assert.throws(() => store.act(a, 'invite', { to: 'b', media: 'audio' }), {
    status: 404,
  });
  assert.equal(store.act(b, 'directory').peers.length, 0);
  assert.ok(store.act(a, 'inbox').events.some((e) => e.type === 'ended'));
  assert.ok(
    !store
      .act(b, 'inbox')
      .events.some((e) => ['signal', 'accepted', 'invite'].includes(e.type)),
  );
  time += 86400000;
  const restored = createPeerSignalingStore({ now: () => time });
  restored.importState(store.exportState());
  assert.equal(restored.act(b, 'blocked').peers[0].id, 'a');
  assert.deepEqual(restored.act(c, 'blocked').peers, []);
  restored.act(b, 'unblock', { to: 'a' });
  assert.deepEqual(restored.act(b, 'blocked').peers, []);
});

test('harassment reporting blocks the sender without claiming police or moderator contact', () => {
  const store = createPeerSignalingStore(),
    a = user('a'),
    b = user('b');
  store.act(b, 'presence', { discoverable: true });
  const invitation = store.act(a, 'invite', { to: 'b', media: 'video' });
  const result = store.act(b, 'report', { to: 'a' });
  assert.ok(result.reportId);
  assert.equal(result.policeContacted, false);
  assert.equal(result.reviewStatus, 'stored-not-reviewed');
  assert.throws(
    () =>
      store.act(b, 'respond', { inviteId: invitation.inviteId, accept: true }),
    { status: 404 },
  );
  assert.throws(() => store.act(a, 'invite', { to: 'b', media: 'audio' }), {
    status: 404,
  });
  assert.equal(store.exportState().reports.length, 1);
});
