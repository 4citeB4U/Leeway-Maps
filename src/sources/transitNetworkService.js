import { readResponseTextCapped } from './httpBody.js';
import { makeRateLimiter } from './rateLimit.js';
import { transitOsmQuery, normalizeTransitOsm } from '../data/transitOsm.js';

const BASE = 'https://transit.land/api/v2/rest/';
const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

/** Geographic discovery uses the same adapter in every city, including intercity feeds.
 * No client-selected upstream URLs or browser-exposed credentials are accepted. */
export function transitNetworkRequest(url) {
  const kind = url.pathname.split('/').at(-1);
  if (!['routes', 'stops', 'departures', 'feeds', 'vehicles'].includes(kind))
    return null;
  const target = new URL(kind, BASE);
  if (kind === 'departures') {
    const stop = url.searchParams.get('stop');
    if (!stop || !/^[\w:~.\-]{1,180}$/.test(stop))
      throw new Error('Select a valid stop');
    target.pathname = `/api/v2/rest/stops/${encodeURIComponent(stop)}/departures`;
    target.searchParams.set('next', '3600');
    // Never substitute an old service week when today's schedule is unavailable.
    target.searchParams.set('use_service_window', 'false');
  } else if (kind === 'feeds') {
    const search = url.searchParams.get('search')?.trim();
    if (!search || search.length > 80)
      throw new Error('Enter an operator or city');
    target.searchParams.set('search', search);
  } else {
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    if (
      !url.searchParams.has('lat') ||
      !url.searchParams.has('lon') ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw new Error('Valid latitude and longitude are required');
    target.searchParams.set('lat', lat.toFixed(3));
    target.searchParams.set('lon', lon.toFixed(3));
    target.searchParams.set('radius', kind === 'stops' ? '3000' : '10000');
    target.searchParams.set('include_geometry', 'true');
    if (kind === 'vehicles') {
      target.pathname = '/api/v2/rest/feeds';
      target.searchParams.set('spec', 'gtfs-rt');
      target.searchParams.delete('include_geometry');
    }
  }
  target.searchParams.set('limit', kind === 'departures' ? '30' : '100');
  if (!['feeds', 'vehicles'].includes(kind))
    target.searchParams.set('include_alerts', 'true');
  const after = url.searchParams.get('after');
  if (after) {
    if (!/^\d{1,20}$/.test(after)) throw new Error('Invalid page cursor');
    target.searchParams.set('after', after);
  }
  return { kind, target };
}

export function createTransitNetworkService({
  fetchImpl = fetch,
  apiKey = process.env.TRANSITLAND_API_KEY,
} = {}) {
  const cache = new Map(),
    pending = new Map(),
    controllers = new Set();
  const admit = makeRateLimiter({ windowMs: 60000, max: 6, globalMax: 40 });
  let closed = false;
  async function handle(incoming) {
    if (closed) return reply(503, { error: 'Transit network service closed' });
    if (incoming.method !== 'GET')
      return reply(405, { error: 'Method not allowed' });
    let route;
    try {
      route = transitNetworkRequest(new URL(incoming.url));
    } catch (error) {
      return reply(400, { error: error.message });
    }
    if (!route)
      return reply(404, { error: 'Unknown transit network operation' });
    const mappedOnly = !apiKey && ['routes', 'stops'].includes(route.kind);
    if (!apiKey && !mappedOnly)
      return reply(503, {
        status: 'credentials-required',
        error:
          'Transit routes and schedules need a server TRANSITLAND_API_KEY.',
        source: 'Transitland',
        coverage:
          'Agency coverage and real-time availability vary; no simulated vehicles are substituted.',
      });
    const key = route.target.href,
      previous = cache.get(key);
    if (previous && previous.until > Date.now())
      return reply(200, previous.body);
    if (!pending.has(key)) {
      if (!admit(key))
        return reply(429, {
          error: 'Transit request limit reached; retry in one minute.',
        });
      pending.set(
        key,
        (async () => {
          const controller = new AbortController();
          controllers.add(controller);
          const timeout = setTimeout(
            () => controller.abort(),
            mappedOnly ? 40000 : route.kind === 'vehicles' ? 30000 : 12000,
          );
          try {
            if (mappedOnly) {
              const query = transitOsmQuery(
                route.kind,
                Number(route.target.searchParams.get('lat')),
                Number(route.target.searchParams.get('lon')),
              );
              let body;
              for (const origin of [
                'https://overpass-api.de',
                'https://overpass.kumi.systems',
              ]) {
                try {
                  const upstream = new URL('/api/interpreter', origin);
                  upstream.searchParams.set('data', query);
                  const signal = AbortSignal.any([
                    controller.signal,
                    AbortSignal.timeout(19000),
                  ]);
                  const response = await fetchImpl(upstream, {
                    headers: {
                      Accept: 'application/json',
                      'User-Agent': 'LeeWayMaps/1.0 (public transit network)',
                    },
                    signal,
                    redirect: 'error',
                  });
                  if (!response.ok)
                    throw new Error('Mapped transit network unavailable');
                  body = normalizeTransitOsm(
                    route.kind,
                    JSON.parse(
                      await readResponseTextCapped(
                        response,
                        12 * 1024 * 1024,
                        signal,
                      ),
                    ),
                  );
                  break;
                } catch {
                  controller.signal.throwIfAborted();
                }
              }
              if (!body) throw new Error('Mapped transit network unavailable');
              cache.set(key, { body, until: Date.now() + 3600000 });
              if (cache.size > 128) cache.delete(cache.keys().next().value);
              return { status: 200, body };
            }
            const response = await fetchImpl(route.target, {
              headers: { apikey: apiKey, Accept: 'application/json' },
              signal: controller.signal,
              redirect: 'error',
            });
            if (!response.ok)
              return {
                status:
                  response.status === 401 || response.status === 403
                    ? 503
                    : 502,
                body: {
                  error:
                    'Transitland access unavailable; check server credentials, subscription, or provider status.',
                  upstreamStatus: response.status,
                },
              };
            const data = JSON.parse(
              await readResponseTextCapped(
                response,
                6 * 1024 * 1024,
                controller.signal,
              ),
            );
            const field =
              route.kind === 'departures'
                ? 'stops'
                : route.kind === 'vehicles'
                  ? 'feeds'
                  : route.kind;
            if (!Array.isArray(data[field]))
              throw new Error('Invalid provider data');
            if (route.kind === 'vehicles') {
              // IDs come from this trusted catalog response; never accept client URLs or feed IDs.
              const feeds = data.feeds
                .filter(
                  (f) =>
                    /^[\w~.\-]{1,180}$/.test(f.onestop_id || '') &&
                    f.urls?.realtime_vehicle_positions,
                )
                .slice(0, 4);
              const vehicles = [],
                coverage = [];
              for (const feed of feeds) {
                const rtUrl = new URL(
                  `feeds/${encodeURIComponent(feed.onestop_id)}/download_latest_rt/vehicle_positions.json`,
                  BASE,
                );
                try {
                  const rtResponse = await fetchImpl(rtUrl, {
                    headers: { apikey: apiKey, Accept: 'application/json' },
                    signal: controller.signal,
                    redirect: 'error',
                  });
                  if (!rtResponse.ok) {
                    coverage.push({
                      feed: feed.onestop_id,
                      status: rtResponse.status,
                    });
                    continue;
                  }
                  const rt = JSON.parse(
                    await readResponseTextCapped(
                      rtResponse,
                      6 * 1024 * 1024,
                      controller.signal,
                    ),
                  );
                  const records = normalizeNetworkVehicles(rt, feed);
                  vehicles.push(...records);
                  coverage.push({
                    feed: feed.onestop_id,
                    name: feed.name,
                    count: records.length,
                    status: 'available',
                  });
                } catch {
                  coverage.push({
                    feed: feed.onestop_id,
                    status: 'unavailable',
                  });
                }
              }
              const body = {
                source: 'Transitland / originating transit agencies',
                kind: 'vehicles',
                vehicles: vehicles.slice(0, 3000),
                coverage,
                retrievedAt: new Date().toISOString(),
                partial: data.feeds.length > feeds.length,
                notice:
                  'Observed agency GPS only. Missing/stale coordinates are not inferred from timetables. Feed licensing and subscription access vary.',
              };
              cache.set(key, { body, until: Date.now() + 30000 });
              if (cache.size > 128) cache.delete(cache.keys().next().value);
              return { status: 200, body };
            }
            const body = {
              source: 'Transitland / originating transit agencies',
              retrievedAt: new Date().toISOString(),
              kind: route.kind,
              [field]: data[field].slice(0, 100),
              next: /^\d{1,20}$/.test(String(data.meta?.after || ''))
                ? String(data.meta.after)
                : null,
              partial: Boolean(data.meta?.next),
              notice:
                'Published schedules and agency alerts; real-time estimates only where supplied. Route geometry is representative, not vehicle GPS.',
            };
            cache.set(key, {
              body,
              until:
                Date.now() + (route.kind === 'departures' ? 30000 : 300000),
            });
            if (cache.size > 128) cache.delete(cache.keys().next().value);
            return { status: 200, body };
          } catch {
            return {
              status: 502,
              body: {
                error: 'Transit network provider did not return usable data.',
              },
            };
          } finally {
            clearTimeout(timeout);
            controllers.delete(controller);
          }
        })(),
      );
    }
    try {
      const result = await pending.get(key);
      return reply(result.status, result.body);
    } finally {
      pending.delete(key);
    }
  }
  return {
    handle,
    close() {
      closed = true;
      for (const c of controllers) c.abort();
      cache.clear();
      pending.clear();
    },
  };
}

export function normalizeNetworkVehicles(payload, feed, now = Date.now()) {
  const timestamp = Number(payload.header?.timestamp) * 1000;
  return (Array.isArray(payload.entity) ? payload.entity : [])
    .slice(0, 5000)
    .flatMap((entity) => {
      const v = entity.vehicle,
        p = v?.position;
      const at = Number(v?.timestamp) * 1000 || timestamp;
      if (
        !p ||
        !Number.isFinite(p.latitude) ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.latitude) > 90 ||
        Math.abs(p.longitude) > 180 ||
        !Number.isFinite(at) ||
        now - at > 180000 ||
        at > now + 60000
      )
        return [];
      return [
        {
          id: `${feed.onestop_id}:${v.vehicle?.id || entity.id}`,
          latitude: p.latitude,
          longitude: p.longitude,
          bearing: Number.isFinite(p.bearing) ? p.bearing : null,
          observedAt: new Date(at).toISOString(),
          operator: feed.name || feed.onestop_id,
          label: v.vehicle?.label || v.vehicle?.id || entity.id,
          route: v.trip?.routeId || v.trip?.route_id || '',
          trip: v.trip?.tripId || v.trip?.trip_id || '',
          attribution:
            feed.license?.attribution_text || feed.name || feed.onestop_id,
        },
      ];
    });
}
