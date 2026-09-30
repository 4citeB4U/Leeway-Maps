// Transport only: voice engine, reference and queue belong to Voice Fabric.
export const VOICE_FABRIC_URL = 'https://4citeb4u.github.io/LeeWay-Voice-Fabric';
export const VOICE_FABRIC_TIMEOUT_MS = 120000;
const SELECTED_VOICE = 'agent-lee-voice-one';
export function createVoiceFabricAdapter({
  loadSdk = () => import(/* @vite-ignore */ `${VOICE_FABRIC_URL}/src/voice-sdk.js`),
  onState = () => {},
} = {}) {
  let client, preparing, muted = false, generation = 0, lifecycle = 0;
  let unsubscribe = [];
  const state = (value) => onState({ provider: 'LeeWay Voice Fabric', ...value });
  const clearListeners = () => { for (const off of unsubscribe) off?.(); unsubscribe = []; };
  async function prepare() {
    if (preparing) return preparing;
    const epoch = lifecycle;
    const ensureCurrent = () => {
      if (epoch !== lifecycle) throw new DOMException('Voice connection was cancelled.', 'AbortError');
    };
    preparing = (async () => {
      state({ status: 'loading' });
      const sdk = await loadSdk();
      ensureCurrent();
      client ||= sdk.createLeeWayVoice({ origin: VOICE_FABRIC_URL, timeoutMs: VOICE_FABRIC_TIMEOUT_MS });
      const activeClient = client;
      const report = (value = {}) => {
        if (epoch !== lifecycle || client !== activeClient || muted) return;
        state({ ...value, status: value.status || 'working' });
      };
      unsubscribe = [
        activeClient.on?.('voice.state', report),
        activeClient.on?.('voice.error', value => report({ ...value, status: 'unavailable' })),
      ];
      const connection = activeClient.connect();
      activeClient.frame?.setAttribute('allow', 'autoplay');
      await connection;
      ensureCurrent();
      await activeClient.selectVoice(SELECTED_VOICE);
      ensureCurrent();
      const result = await activeClient.prepare();
      ensureCurrent();
      if (!result.ready || result.selectedVoiceId !== SELECTED_VOICE) throw new Error('Agent Lee Voice One is unavailable');
      state({ status: muted ? 'muted' : 'ready', voice: result.selectedVoiceId });
      return activeClient;
    })().catch(error => {
      // A cancelled older load must not destroy a newly connected client.
      if (epoch === lifecycle) {
        clearListeners(); client?.destroy(); client = null; preparing = null;
        state({ status: 'unavailable', message: error.message });
      }
      throw error;
    });
    return preparing;
  }
  return {
    prepare,
    async speak(text) {
      if (muted) return { muted: true };
      const current = generation;
      const voice = await prepare();
      if (muted || current !== generation) return { stopped: true };
      try {
        state({ status: 'generating', message: 'Voice Fabric is preparing speech.' });
        const result = await voice.speak(String(text).slice(0, 12000));
        if (!muted && current === generation) state({ status: 'ready' });
        return result;
      } catch (error) {
        if (!muted && current === generation) state({ status: 'unavailable', message: error.message });
        throw error;
      }
    },
    async stop({ mute = false } = {}) {
      generation++; if (mute) muted = true;
      const current = generation;
      if (client) await client.stop();
      if (current === generation) state({ status: muted ? 'muted' : 'stopped' });
    },
    resume() { muted = false; state({ status: 'idle' }); },
    destroy() { generation++; lifecycle++; clearListeners(); client?.destroy(); client = null; preparing = null; },
  };
}
