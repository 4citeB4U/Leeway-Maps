import { transitFeedsInRange } from '../data/transitFeeds.js';
import { buildTransitSnapshot } from '../data/transitProxy.js';
import { readResponseBytesCapped } from './httpBody.js';

export function mtaRailFeeds(lat, lon) {
  return transitFeedsInRange(lat, lon).filter(feed => ['mta-lirr', 'mta-mnr'].includes(feed.id));
}
export async function fetchMtaRailVehicles(feeds, { fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const coverage = [], vehicles = [];
  for (const feed of feeds) {
    try {
      const response = await fetchImpl(feed.url, { signal, redirect: 'error', headers: { Accept: 'application/x-protobuf' } });
      if (!response.ok) throw Error('Upstream unavailable');
      const bytes = await readResponseBytesCapped(response, 4 * 1024 * 1024);
      signal?.throwIfAborted();
      const snapshot = buildTransitSnapshot(feed, bytes, now);
      let count = 0;
      for (const v of snapshot.vehicles) {
        const at = v.timestamp * 1000;
        // This minimal live layer does not retain delayed trains as current GPS.
        if (v.timestampSource !== 'vehicle' || !Number.isFinite(at) || now - at > 60000 || at > now + 10000) continue;
        vehicles.push({ id: `${feed.id}:${v.id}`, latitude: v.lat, longitude: v.lon,
          bearing: v.bearing, observedAt: new Date(at).toISOString(), operator: feed.name,
          label: v.label || v.id, route: v.routeId || 'Rail', trip: v.tripId || '',
          attribution: feed.attribution, source: 'MTA official rail feed',
          timestampSource: v.timestampSource || 'vehicle',
        }); count++;
      }
      coverage.push({ id: feed.id, name: feed.name, status: 'available', count, feedTimestamp: snapshot.feedTimestamp });
    } catch (error) {
      signal?.throwIfAborted();
      coverage.push({ id: feed.id, name: feed.name, status: 'unavailable', count: 0 });
    }
  }
  return { source: 'MTA rail data redistributed by LeeWay', kind: 'vehicles', vehicles, coverage,
    retrievedAt: new Date(now).toISOString(), partial: true,
    notice: 'LIRR and Metro-North GPS only. Subway arrivals and NYC bus positions are not included. Data may be incomplete; no MTA endorsement. Fixes older than one minute are omitted.',
  };
}
