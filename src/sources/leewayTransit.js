import { createTransitSource } from '../layers/transit/source.js';
import { transitFeedsInRange } from '../data/transitFeeds.js';

export const LEEWAY_TRANSIT_FEED_ID = 'leeway-transit-hub';

export const LEEWAY_TRANSIT_FEED = Object.freeze({
  id: LEEWAY_TRANSIT_FEED_ID,
  name: 'LeeWay Transit Hub',
  operator: 'LeeWay Industries',
  region: 'Local governed tenant fleet',
  attribution: 'LeeWay Enterprise Transit Hub — local governed data',
  license: 'Private tenant data / LeeWay governed',
  licenseUrl: '',
  historyRetention: false,
  defaultMode: 'bus',
  localOnly: true,
});

/**
 * Browser-side source adapter. Public GTFS feeds retain the upstream source;
 * the private LeeWay fleet is fetched only from same-origin local middleware.
 */
export function createLeeWayTransitSource({
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  const upstream = createTransitSource({ fetchImpl });
  return {
    feedsInRange(lat, lon, slackKm = 0) {
      return [LEEWAY_TRANSIT_FEED, ...transitFeedsInRange(lat, lon, slackKm)];
    },
    getHistory(feedId, vehicleId, options) {
      return upstream.getHistory(feedId, vehicleId, options);
    },
    requestSnapshot(feedId, { signal } = {}) {
      if (feedId !== LEEWAY_TRANSIT_FEED_ID) {
        return upstream.requestSnapshot(feedId, { signal });
      }
      signal?.throwIfAborted();
      return Promise.resolve(
        fetchImpl('/api/leeway-transit/vehicles', {
          signal,
          headers: { Accept: 'application/json' },
        }),
      );
    },
  };
}
