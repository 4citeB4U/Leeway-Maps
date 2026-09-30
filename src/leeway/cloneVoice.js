import { runtimeBase } from './agentRuntime.js';

export const LEEWAY_CLONE_ID = 'LEEWAY_VOICE::AGENT_LEE::DEFAULT_CLONE';

/** The configured service owns the speaker reference; no workstation path is sent. */
export async function requestCloneSpeech({
  endpoint,
  text,
  language = 'en',
  signal,
  fetchImpl = fetch,
}) {
  const tts = new URL(runtimeBase(endpoint));
  if (!tts.pathname.endsWith('/tts'))
    throw new Error('Use the LeeWay voice service /tts endpoint.');
  const base = new URL('./', tts);
  const options = {
    signal,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  };
  const identityResponse = await fetchImpl(
    new URL('voice-identity', base).href,
    options,
  );
  if (!identityResponse.ok)
    throw new Error(`Voice identity HTTP ${identityResponse.status}`);
  const identity = await identityResponse.json();
  if (identity.voiceId !== LEEWAY_CLONE_ID || identity.voice_loaded !== true)
    throw new Error(
      'The configured service has not verified the selected LeeWay clone.',
    );
  if (
    !Array.isArray(identity.supportedLanguages) ||
    !identity.supportedLanguages.includes(language)
  )
    throw new Error(
      `The selected clone service does not support ${language}. No substitute voice was used.`,
    );
  signal?.throwIfAborted();
  const response = await fetchImpl(tts.href, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, voice: LEEWAY_CLONE_ID, language, speed: 1 }),
  });
  if (!response.ok) throw new Error(`Clone speech HTTP ${response.status}`);
  if (response.headers.get('content-type')?.startsWith('audio/')) {
    if (response.headers.get('x-leeway-voice-id') !== LEEWAY_CLONE_ID)
      throw new Error(
        'Audio adapter did not confirm the selected LeeWay clone.',
      );
    const blob = await response.blob();
    signal?.throwIfAborted();
    if (!blob.size) throw new Error('Voice service returned empty audio.');
    return {
      blob,
      voiceId: identity.voiceId,
      engine: String(identity.engine || 'unspecified'),
    };
  }
  const result = await response.json();
  if (result.status !== 'success' || result.voice !== LEEWAY_CLONE_ID)
    throw new Error(
      'Speech response did not confirm the selected LeeWay clone.',
    );
  // The service returns its own filesystem path. Resolve only a WAV basename
  // under its documented audio route, never an arbitrary URL or file location.
  const path = String(result.audio_path || '');
  const filename = path.split('/').at(-1);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.wav$/.test(filename) ||
    path.includes('..') ||
    path.includes('://')
  )
    throw new Error('Voice service returned an invalid audio reference.');
  signal?.throwIfAborted();
  const audio = await fetchImpl(
    new URL(`audio/${filename}`, base).href,
    options,
  );
  if (!audio.ok) throw new Error(`Clone audio HTTP ${audio.status}`);
  const blob = await audio.blob();
  signal?.throwIfAborted();
  if (!blob.type.startsWith('audio/') || !blob.size)
    throw new Error('Voice service did not return usable audio.');
  return {
    blob,
    voiceId: identity.voiceId,
    engine: String(identity.engine || 'unspecified'),
  };
}
