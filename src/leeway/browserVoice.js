let libraryPromise;
export const CHATTERBOX_BYTES = 1548283901;
export const CHATTERBOX_REVISION = '3cab09af388d3f02bba43443fce88c1f4525ac43';

export async function voiceStorageStatus({
  storage = navigator.storage,
  cacheStorage = globalThis.caches,
} = {}) {
  const estimate = await storage?.estimate?.();
  let cachedBytes = 0,
    cachedFiles = 0;
  const seen = new Set();
  // Browser caches are origin-scoped. Never infer another app's inventory.
  if (cacheStorage)
    for (const name of await cacheStorage.keys()) {
      const cache = await cacheStorage.open(name);
      for (const request of await cache.keys()) {
        if (
          !request.url.includes(
            `/chatterbox-ONNX/resolve/${CHATTERBOX_REVISION}/`,
          )
        )
          continue;
        if (seen.has(request.url)) continue;
        seen.add(request.url);
        const response = await cache.match(request);
        cachedBytes += Math.max(
          0,
          Number(response?.headers.get('content-length')) || 0,
        );
        cachedFiles++;
      }
    }
  const available =
    estimate?.quota == null
      ? null
      : Math.max(0, estimate.quota - (estimate.usage || 0));
  const required =
    Math.max(0, CHATTERBOX_BYTES - Math.min(cachedBytes, CHATTERBOX_BYTES)) +
    200_000_000;
  return {
    available,
    required,
    cachedFiles,
    cachedBytes,
    enough: available !== null && available >= required,
  };
}

export async function loadBrowserVoiceLibrary() {
  if (globalThis.LeeWayBrowserVoice) return globalThis.LeeWayBrowserVoice;
  if (!libraryPromise)
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${import.meta.env.BASE_URL}agent-voice/browser-voice.js`;
      script.onload = () =>
        globalThis.LeeWayBrowserVoice
          ? resolve(globalThis.LeeWayBrowserVoice)
          : reject(new Error('Voice library did not initialize'));
      script.onerror = () => {
        script.remove();
        reject(
          new Error('Voice library could not load. Retry when connected.'),
        );
      };
      document.head.append(script);
    }).catch((error) => {
      libraryPromise = null;
      throw error;
    });
  return libraryPromise;
}
