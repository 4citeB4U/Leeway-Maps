import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerMediaSession } from './peerCommsCore.js';
class Peer {
  static instances = [];
  constructor(config) {
    this.config = config;
    this.tracks = [];
    this.candidates = [];
    Peer.instances.push(this);
  }
  createDataChannel() {
    return (this.channel = {
      readyState: 'open',
      bufferedAmount: 0,
      sent: [],
      send(value) {
        this.sent.push(value);
      },
      close() {
        this.closed = true;
      },
    });
  }
  async createOffer() {
    return { type: 'offer', sdp: 'fixture-offer' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'fixture-answer' };
  }
  async setLocalDescription(value) {
    this.localDescription = value;
  }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
  }
  async addIceCandidate(value) {
    this.candidates.push(value);
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  close() {
    this.closed = true;
  }
}
function stream() {
  const audio = {
      enabled: true,
      stop() {
        this.stopped = true;
      },
    },
    video = {
      stop() {
        this.stopped = true;
      },
    };
  return {
    audio,
    video,
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  };
}
test('no acceptance means no peer connection and no media permission request', async () => {
  let requests = 0;
  const before = Peer.instances.length;
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    mediaDevices: {
      getUserMedia() {
        requests++;
      },
    },
    sendSignal() {},
  });
  await assert.rejects(
    session.start({ sessionId: 'one', media: 'video', accepted: false }),
    /Both users/,
  );
  assert.equal(requests, 0);
  assert.equal(Peer.instances.length, before);
});
test('text-only accepted session never requests microphone or camera', async () => {
  let requests = 0;
  const signals = [];
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    mediaDevices: {
      getUserMedia() {
        requests++;
      },
    },
    sendSignal: (value) => signals.push(value),
  });
  await session.start({
    sessionId: 'one',
    media: 'text',
    accepted: true,
    initiator: true,
  });
  assert.equal(requests, 0);
  assert.equal(signals[0].description.type, 'offer');
  assert.equal(session.sendText('  Hello  '), 'Hello');
  assert.deepEqual(JSON.parse(session.channel.sent[0]), {
    type: 'text',
    text: 'Hello',
  });
  session.stop();
});
test('accepted audio captures muted and push-to-talk release disables track', async () => {
  const local = stream();
  let constraints;
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    mediaDevices: {
      async getUserMedia(value) {
        constraints = value;
        return local;
      },
    },
    sendSignal() {},
  });
  await session.start({
    sessionId: 'one',
    media: 'audio',
    accepted: true,
    initiator: false,
  });
  assert.equal(constraints.video, false);
  assert.equal(local.audio.enabled, false);
  session.setTalking(true);
  assert.equal(local.audio.enabled, true);
  session.setTalking(false);
  assert.equal(local.audio.enabled, false);
  const pc = session.pc;
  session.stop();
  assert.equal(local.audio.stopped, true);
  assert.equal(local.video.stopped, true);
  assert.equal(pc.closed, true);
});
test('ending while camera permission is pending stops late acquired tracks', async () => {
  let resolve;
  const local = stream();
  const signals = [];
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    mediaDevices: { getUserMedia: () => new Promise((r) => (resolve = r)) },
    sendSignal: (value) => signals.push(value),
  });
  const pending = session.start({
    sessionId: 'one',
    media: 'video',
    accepted: true,
    initiator: true,
  });
  session.stop();
  resolve(local);
  assert.equal(await pending, false);
  assert.equal(local.audio.stopped, true);
  assert.equal(local.video.stopped, true);
  assert.equal(signals.length, 0);
});
test('ICE arriving before offer is queued, then answer uses the same accepted session', async () => {
  const signals = [];
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    sendSignal: (value) => signals.push(value),
  });
  await session.start({
    sessionId: 'one',
    media: 'text',
    accepted: true,
    initiator: false,
  });
  await session.signal({
    sessionId: 'wrong',
    candidate: { candidate: 'ignored' },
  });
  assert.equal(session.candidates.length, 0);
  await session.signal({
    sessionId: 'one',
    candidate: { candidate: 'allowed' },
  });
  assert.equal(session.candidates.length, 1);
  await session.signal({
    sessionId: 'one',
    description: { type: 'offer', sdp: 'fixture' },
  });
  assert.equal(session.pc.candidates.length, 1);
  assert.equal(signals[0].description.type, 'answer');
  session.stop();
});
test('message bounds and congestion prevent unbounded datachannel buffering', async () => {
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    sendSignal() {},
  });
  await session.start({
    sessionId: 'one',
    media: 'text',
    accepted: true,
    initiator: true,
  });
  assert.throws(() => session.sendText('x'.repeat(4001)), /1–4000/);
  session.channel.bufferedAmount = 64001;
  assert.throws(() => session.sendText('Hello'), /congested/);
  session.stop();
  assert.throws(() => session.sendText('Hello'), /not connected/);
});
test('media permission rejection closes partially initialized peer', async () => {
  const session = new PeerMediaSession({
    PeerConnection: Peer,
    mediaDevices: {
      getUserMedia: async () => {
        throw new Error('Permission denied');
      },
    },
    sendSignal() {},
  });
  await assert.rejects(
    session.start({ sessionId: 'one', media: 'video', accepted: true }),
    /Permission denied/,
  );
  assert.equal(Peer.instances.at(-1).closed, true);
  assert.equal(session.pc, null);
});
