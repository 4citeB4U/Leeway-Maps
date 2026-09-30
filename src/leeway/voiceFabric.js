// Transport only: voice engine, reference and queue belong to Voice Fabric.
export const VOICE_FABRIC_URL = 'https://4citeb4u.github.io/LeeWay-Voice-Fabric';
export function createVoiceFabricAdapter({
  loadSdk = () => import(/* @vite-ignore */ `${VOICE_FABRIC_URL}/src/voice-sdk.js`),
  onState = () => {},
} = {}) {
  let client, preparing, muted = false, generation = 0;
  const state = (value) => onState({ provider: 'LeeWay Voice Fabric', ...value });
  async function prepare() {
    if (preparing) return preparing;
    preparing = (async () => {
      state({ status: 'loading' });
      const sdk = await loadSdk();
      client ||= sdk.createLeeWayVoice({ origin: VOICE_FABRIC_URL, timeoutMs: 30000 });
      const connection = client.connect();
      client.frame?.setAttribute('allow', 'autoplay');
      await connection;
      await client.selectVoice('agent-lee-voice-one');
      const result = await client.prepare();
      if (!result.ready || result.selectedVoiceId !== 'agent-lee-voice-one') throw new Error('Agent Lee Voice One is unavailable');
      state({ status: 'ready', voice: result.selectedVoiceId });
      return client;
    })().catch(error => { client?.destroy(); client = null; preparing = null; state({ status: 'unavailable', message: error.message }); throw error; });
    return preparing;
  }
  return {
    prepare,
    async speak(text) {
      if (muted) return { muted: true };
      const current = generation;
      const voice = await prepare();
      if (muted || current !== generation) return { stopped: true };
      return voice.speak(String(text).slice(0, 12000));
    },
    async stop({ mute = false } = {}) {
      generation++; if (mute) muted = true;
      if (client) await client.stop();
      state({ status: muted ? 'muted' : 'stopped' });
    },
    resume() { muted = false; state({ status: 'idle' }); },
    destroy() { generation++; client?.destroy(); client = null; preparing = null; },
  };
}
