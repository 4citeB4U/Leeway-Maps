/** A cache belongs to one load only: no height reuse across view/surface changes. */
export function sampleTrafficHeight(scene, cartographic, cache) {
  const key = `${cartographic.longitude},${cartographic.latitude}`;
  if (cache instanceof Map && cache.has(key)) return cache.get(key);
  // A visible globe has CPU-resident terrain heights. scene.sampleHeight instead
  // renders a pick pass and reads GPU depth synchronously for every road, including
  // unrelated imagery/primitives. Never issue that pass for a globe-hosted map.
  // An unloaded terrain tile is a miss; the caller retains its ellipsoid fallback.
  const height = scene.globe?.show === true
    ? scene.globe.getHeight?.(cartographic)
    : scene.sampleHeightSupported === false
      ? undefined
      : scene.sampleHeight?.(cartographic);
  if (cache instanceof Map && Number.isFinite(height)) cache.set(key, height);
  return height;
}

/** Yield between bounded groups of road materialization and GPU height reads. */
export async function materializeTrafficRoads(data, parse, {
  signal,
  isCurrent = () => true,
  heightCache = new Map(),
  yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
  now = () => performance.now(),
} = {}) {
  const check = () => {
    signal?.throwIfAborted();
    if (!isCurrent()) throw new DOMException('Road load superseded', 'AbortError');
  };
  const result = [];
  let batch = 0, started = now();
  for (const road of data?.roads || []) {
    check();
    result.push(...parse({ ...data, roads: [road], groundHeightCache: heightCache }));
    check();
    if (++batch >= 4 || now() - started >= 4) {
      await yieldTask();
      check();
      batch = 0;
      started = now();
    }
  }
  check();
  return result;
}
