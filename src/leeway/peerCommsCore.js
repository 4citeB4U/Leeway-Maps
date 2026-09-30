/** One mutually accepted session. Identity and invitation authority stay server-side. */
export class PeerMediaSession {
  constructor({
    PeerConnection = globalThis.RTCPeerConnection,
    mediaDevices = globalThis.navigator?.mediaDevices,
    sendSignal,
    onState = () => {},
    onMessage = () => {},
    onRemoteStream = () => {},
    onLocalStream = () => {},
  } = {}) {
    Object.assign(this, {
      PeerConnection,
      mediaDevices,
      sendSignal,
      onState,
      onMessage,
      onRemoteStream,
      onLocalStream,
    });
    this.epoch = 0;
    this.pc = null;
    this.local = null;
    this.channel = null;
    this.candidates = [];
    this.connectionTimer = null;
  }
  async start({
    sessionId,
    media,
    initiator,
    iceServers = [],
    accepted = false,
  }) {
    if (!accepted)
      throw new Error('Both users must accept before a connection starts.');
    if (!['text', 'audio', 'video'].includes(media))
      throw new Error('Unsupported channel media.');
    this.stop();
    const epoch = this.epoch;
    this.sessionId = sessionId;
    if (!this.PeerConnection)
      throw new Error('WebRTC is unavailable in this browser.');
    const pc = (this.pc = new this.PeerConnection({ iceServers }));
    pc.onicecandidate = (event) => {
      if (event.candidate && epoch === this.epoch)
        this.sendSignal({
          sessionId,
          candidate: event.candidate.toJSON?.() || event.candidate,
        });
    };
    pc.onconnectionstatechange = () => {
      if (epoch === this.epoch) {
        this.onState(pc.connectionState);
        if (pc.connectionState === 'connected')
          clearTimeout(this.connectionTimer);
        if (['failed', 'closed'].includes(pc.connectionState))
          this.setTalking(false);
      }
    };
    pc.ontrack = (event) => {
      if (epoch === this.epoch)
        this.onRemoteStream(
          event.streams?.[0] || new MediaStream([event.track]),
        );
    };
    pc.ondatachannel = (event) => {
      if (epoch === this.epoch) this.bindChannel(event.channel, epoch);
    };
    try {
      if (media !== 'text') {
        if (!this.mediaDevices?.getUserMedia)
          throw new Error(
            'Microphone/camera unavailable. Use HTTPS and grant permission.',
          );
        const stream = await this.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: media === 'video',
        });
        if (epoch !== this.epoch) {
          stream.getTracks().forEach((track) => track.stop());
          return false;
        }
        this.local = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
        this.onLocalStream(stream);
      }
      if (epoch !== this.epoch) return false;
      this.connectionTimer = setTimeout(() => {
        if (epoch === this.epoch) {
          this.stop();
          this.onState('failed');
        }
      }, 45000);
      if (initiator) {
        this.bindChannel(
          pc.createDataChannel('leeway-peer-text', { ordered: true }),
          epoch,
        );
        const offer = await pc.createOffer();
        if (epoch !== this.epoch) return false;
        await pc.setLocalDescription(offer);
        if (epoch !== this.epoch) return false;
        this.sendSignal({ sessionId, description: pc.localDescription });
      }
      this.onState('connecting');
      return true;
    } catch (error) {
      if (epoch === this.epoch) this.stop();
      throw error;
    }
  }
  bindChannel(channel, epoch) {
    this.channel = channel;
    channel.onopen = () => {
      if (epoch === this.epoch) {
        clearTimeout(this.connectionTimer);
        this.onState('text-ready');
      }
    };
    channel.onmessage = (event) => {
      if (
        epoch !== this.epoch ||
        typeof event.data !== 'string' ||
        event.data.length > 8000
      )
        return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'text' && typeof message.text === 'string')
          this.onMessage(message.text.slice(0, 4000));
      } catch {}
    };
  }
  async signal(message) {
    if (!this.pc || message.sessionId !== this.sessionId) return;
    const pc = this.pc,
      epoch = this.epoch;
    if (message.description) {
      if (!['offer', 'answer'].includes(message.description.type))
        throw new Error('Unsupported signaling description.');
      await pc.setRemoteDescription(message.description);
      if (epoch !== this.epoch) return;
      for (const candidate of this.candidates.splice(0))
        await pc.addIceCandidate(candidate);
      if (message.description.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        if (epoch === this.epoch)
          this.sendSignal({
            sessionId: this.sessionId,
            description: pc.localDescription,
          });
      }
    } else if (message.candidate) {
      if (!pc.remoteDescription) {
        if (this.candidates.length >= 128)
          throw new Error('Too many pending ICE candidates.');
        this.candidates.push(message.candidate);
      } else await pc.addIceCandidate(message.candidate);
    }
  }
  sendText(text) {
    const value = String(text).trim();
    if (!value || value.length > 4000)
      throw new Error('Enter a message of 1–4000 characters.');
    if (this.channel?.readyState !== 'open')
      throw new Error('The peer text channel is not connected.');
    if (this.channel.bufferedAmount > 64000)
      throw new Error('Peer connection is congested; try again shortly.');
    this.channel.send(JSON.stringify({ type: 'text', text: value }));
    return value;
  }
  setTalking(active) {
    this.local?.getAudioTracks().forEach((track) => {
      track.enabled = !!active;
    });
  }
  stop() {
    clearTimeout(this.connectionTimer);
    this.connectionTimer = null;
    this.epoch++;
    this.local?.getTracks().forEach((track) => track.stop());
    this.local = null;
    const pc = this.pc;
    this.pc = null;
    this.channel?.close();
    this.channel = null;
    pc?.close();
    this.candidates = [];
    this.sessionId = null;
  }
}
