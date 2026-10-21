/*
LEEWAY HEADER — DO NOT REMOVE
REGION: LeeWay Maps / Canonical Voice Fabric Adapter
TAG: LEEWAY.MAPS.VOICE.FABRIC_ADAPTER
WHAT: Bind Maps speech to the selected canonical Voice Fabric voice without owning synthesis.
WHY: The shared Voice Fabric voice profile and labelled device fallbacks must work without requiring an optional clone.
WHO: LeeWay Industries / Creator-directed integration; this change is not a production approval.
WHERE: src/leeway/voiceFabric.js
WHEN: Voice is prepared, spoken, interrupted, or released.
HOW: Use Voice Fabric bridge contracts; require a confirmed prepared voice and report fallbacks transparently.
AUTHORIZED ROLES: Creator-directed source integration; production admission remains with LeeWay governance.
LICENSE: MIT (host repository).
*/
// Transport only: voice engine, reference and queue belong to Voice Fabric.
export const VOICE_FABRIC_URL = 'https://4citeb4u.github.io/LeeWay-Voice-Fabric';
export const VOICE_FABRIC_TIMEOUT_MS = 15 * 60_000;
export const VOICE_FABRIC_HANDSHAKE_MS = 120_000;
export function awaitVoiceHandshake(request, stage, signal, timeoutMs = VOICE_FABRIC_HANDSHAKE_MS) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const fail = error => { cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Voice connection was cancelled.', 'AbortError'));
    const timer = setTimeout(() => fail(new Error(`Voice Fabric ${stage} timed out. Text and map controls remain available.`)), timeoutMs);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(request).then(value => { cleanup(); resolve(value); }, fail);
  });
}
export function createVoiceFabricAdapter({
  loadSdk = () => import(/* @vite-ignore */ `${VOICE_FABRIC_URL}/src/voice-sdk.js?v=prepare-progress-v1`),
  onState = () => {},
} = {}) {
  let client, preparing, muted = false, generation = 0, lifecycle = 0;
  let unsubscribe = [];
  let handshakeAbort;
  const state = (value) => onState({ provider: 'LeeWay Voice Fabric', ...value });
  const clearListeners = () => { for (const off of unsubscribe) off?.(); unsubscribe = []; };
  async function prepare() {
    if (preparing) return preparing;
    const epoch = lifecycle;
    const abort = handshakeAbort = new AbortController();
    let stage = 'connecting';
    const ensureCurrent = () => {
      if (epoch !== lifecycle) throw new DOMException('Voice connection was cancelled.', 'AbortError');
    };
    preparing = (async () => {
      state({ status: 'loading', message: 'Connecting to external LeeWay Voice Fabric. Text and map controls remain available.' });
      const sdk = await awaitVoiceHandshake(loadSdk(), 'SDK loading', abort.signal);
      ensureCurrent();
      client ||= sdk.createLeeWayVoice({ origin: VOICE_FABRIC_URL, timeoutMs: VOICE_FABRIC_HANDSHAKE_MS, prepareInactivityMs: VOICE_FABRIC_TIMEOUT_MS });
      const activeClient = client;
      const report = (value = {}) => {
        if (epoch !== lifecycle || client !== activeClient || muted) return;
        const percent = Number.isFinite(value.progress) ? Math.round(value.progress) : Number(value.total) > 0 && Number.isFinite(value.loaded) ? Math.round(100 * value.loaded / value.total) : null;
        const message = value.message || (stage === 'preparing'
          ? `Preparing the active LeeWay voice${value.file ? ` · ${value.file}` : ''}${percent === null ? '' : ` · ${percent}%`}. First load is about 1.5 GB and may take several minutes; preparation stops after 15 minutes without progress. Map controls remain available.`
          : `Voice Fabric: ${value.status || 'working'}`);
        state({ ...value, message, status: value.status === 'unavailable' ? 'unavailable' : stage === 'preparing' ? 'loading' : value.status || 'working' });
      };
      unsubscribe = [
        activeClient.on?.('voice.state', report),
        activeClient.on?.('voice.error', value => report({ ...value, status: 'unavailable' })),
        activeClient.on?.('voice.fallback', value => {
          if (epoch !== lifecycle || client !== activeClient || muted) return;
          state({ status: 'fallback', fallback: value,
            message: `Voice Fabric fallback: ${value?.requested || 'requested voice'} → ${value?.actual || 'available provider'}.` });
        }),
      ];
      const connection = activeClient.connect();
      activeClient.frame?.setAttribute('allow', 'autoplay');
      await awaitVoiceHandshake(connection, 'connection', abort.signal);
      ensureCurrent();
      // Voice Fabric owns the active profile, provider choice and labelled fallback.
      // Never force its optional clone or silently select an alternate package.
      stage = 'preparing';
      state({ status: 'loading', message: 'Preparing the active LeeWay voice. Preparation stops after 15 minutes without progress. Text and map controls remain available.' });
      const result = await activeClient.prepare();
      ensureCurrent();
      if (!result?.ready || typeof result.selectedVoiceId !== 'string' || !result.selectedVoiceId) {
        throw new Error('Voice Fabric did not confirm a prepared voice');
      }
      stage = 'ready';
      state({ status: muted ? 'muted' : 'ready', voice: result.selectedVoiceId,
        fallback: result.fallback || null,
        message: result.fallback
          ? `Voice Fabric fallback active: ${result.fallback.requested || 'requested voice'} → ${result.selectedVoiceId}.`
          : `Voice Fabric ready: ${result.selectedVoiceId}.` });
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
    destroy() { generation++; lifecycle++; handshakeAbort?.abort(); clearListeners(); client?.destroy(); client = null; preparing = null; },
  };
}
