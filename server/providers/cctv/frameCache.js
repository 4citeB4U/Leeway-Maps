/** Short-lived verified frames only. Never turn a failed refresh into live imagery.
 * Coalesce simultaneous viewers and cap retained bytes and in-flight requests.
 */
export function createCctvFrameCache({
  now = Date.now,
  ttlMs = 30_000,
  maxBytes = 32 * 1024 * 1024,
  maxPending = 32,
} = {}) {
  const frames = new Map();
  const pending = new Map();
  let bytes = 0;
  function remove(key) {
    bytes -= frames.get(key)?.value.body.length || 0;
    frames.delete(key);
  }
  return async function getFrame(key, load) {
    for (const [id, entry] of frames) {
      if (now() - entry.at >= ttlMs) remove(id);
    }
    const cached = frames.get(key);
    if (cached) return cached.value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) return { busy: true };
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        if (
          value?.ok &&
          value.body?.length > 0 &&
          value.body.length <= maxBytes
        ) {
          while (bytes + value.body.length > maxBytes && frames.size) {
            remove(frames.keys().next().value);
          }
          frames.set(key, { value, at: now() });
          bytes += value.body.length;
        }
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
