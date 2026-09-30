/** Gate optional aircraft meshes by the actual build inventory and URL failures. */
export function createAircraftModelGate({
  assets = null,
  now = Date.now,
  cooldownMs = 60000,
} = {}) {
  const inventory = Array.isArray(assets) ? new Set(assets) : null;
  const retryAt = new Map(),
    pending = new Set(),
    verified = new Set();
  const known = (url) => !inventory || inventory.has(url);
  function canAttempt(url) {
    return (
      known(url) &&
      (retryAt.get(url) || 0) <= now() &&
      (!pending.has(url) || verified.has(url))
    );
  }
  return {
    canAttempt,
    async load(url, create) {
      if (!canAttempt(url))
        throw new Error('Aircraft model unavailable; using map icon');
      pending.add(url);
      try {
        const model = await create();
        verified.add(url);
        retryAt.delete(url);
        return model;
      } catch (error) {
        verified.delete(url);
        retryAt.set(url, now() + cooldownMs);
        throw error;
      } finally {
        pending.delete(url);
      }
    },
    warning(enabled = true) {
      if (!enabled) return null;
      if (inventory && inventory.size === 0)
        return '3D aircraft models are not installed; aircraft remain visible as map icons';
      if ([...retryAt.values()].some((time) => time > now()))
        return 'A 3D aircraft model failed to load; map icons remain visible';
      return null;
    },
  };
}
const manifest = import.meta.env?.LEEWAY_AIRCRAFT_MODEL_ASSETS;
const gate = createAircraftModelGate({ assets: manifest });
// Non-Vite library consumers supply their own assets and retain their loader contract.
export const aircraftModelGate = Array.isArray(manifest)
  ? gate
  : {
      canAttempt: () => true,
      load: (_url, create) => create(),
      warning: () => null,
    };
