import { fetchTransitHistory } from '../../sources/transitHistory.js';

/** Request transit snapshots through caller-owned transport. */
export function createTransitSource({
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  return {
    getHistory(feedId, vehicleId, { signal } = {}) {
      signal?.throwIfAborted();
      return fetchTransitHistory(feedId, vehicleId, signal, fetchImpl);
    },
    requestMapMatch(points, mode = 'bus', { signal } = {}) {
      signal?.throwIfAborted();
      if (!Array.isArray(points) || points.length < 3 || points.length > 12)
        throw new TypeError('3–12 transit GPS points are required');
      return Promise.resolve(
        fetchImpl('/api/transit/map-match', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ points, mode }),
          signal,
        }),
      ).then(async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => ({})),
      }));
    },
    requestSnapshot(feedId, { signal } = {}) {
      signal?.throwIfAborted();
      if (typeof feedId !== 'string' || !feedId || feedId.length > 160)
        throw new TypeError('A transit feed identifier is required');
      return Promise.resolve(
        fetchImpl(`/api/transit/vehicles/${encodeURIComponent(feedId)}`, {
          signal,
          headers: { Accept: 'application/json' },
        }),
      ).then((response) => {
        signal?.throwIfAborted();
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          async json() {
            const body = await response.json();
            signal?.throwIfAborted();
            return body;
          },
        };
      });
    },
  };
}
