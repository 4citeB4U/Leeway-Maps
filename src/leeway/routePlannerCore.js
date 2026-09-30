import { normalizeOsrmSteps } from '../data/routeSteps.js';
import { addressText } from './addressStore.js';
import {
  normalizeValhallaUrl,
  valhallaCosting,
  valhallaRequest,
  requestValhalla,
  normalizeValhallaRoute,
  normalizeValhallaMatrix,
} from './valhallaRouting.js';

export const MAX_STOPS = 12; // origin, ten deliveries, destination
export const VEHICLE_MPG_ASSUMPTIONS = Object.freeze({
  car: 25,
  van: 18,
  truck: 8,
  semi: 6.5,
});

// Abort saves provider work; revision ownership also rejects providers that finish
// despite cancellation. All stop, profile, clear and destroy mutations invalidate.
export function createPlannerRequests() {
  let revision = 0;
  let controller = null;
  function invalidate() {
    revision++;
    controller?.abort();
    controller = null;
  }
  function capture() {
    const own = revision;
    return { isCurrent: () => own === revision };
  }
  return {
    invalidate,
    capture,
    begin() {
      invalidate();
      controller = new AbortController();
      return { ...capture(), signal: controller.signal };
    },
  };
}
export const DEFAULT_VEHICLE = Object.freeze({
  type: 'car',
  heightM: 4.1,
  widthM: 2.6,
  lengthM: 22,
  grossWeightKg: 36287,
  axleWeightKg: 9000,
  axleCount: 5,
  hazmat: false,
  oversize: false,
  avoidTolls: false,
  excludeTolls: false,
  mpg: 25,
  fuelPrice: 0,
});
export function validPoint(p) {
  return (
    Number.isFinite(p?.lat) &&
    Number.isFinite(p?.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  );
}
export function currentLocationPoint(position, now = Date.now()) {
  const point = {
    lat: position?.coords?.latitude,
    lon: position?.coords?.longitude,
    label: 'Current location — finding street address',
  };
  if (
    !validPoint(point) ||
    !Number.isFinite(position?.timestamp) ||
    now - position.timestamp > 30000 ||
    position.timestamp > now + 5000
  )
    throw new Error(
      'The device did not return a fresh valid location. Try My Location again.',
    );
  if (
    !Number.isFinite(position.coords.accuracy) ||
    position.coords.accuracy < 0
  )
    throw new Error(
      'The device could not determine location accuracy. Try My Location again.',
    );
  return point;
}
export function parseCoordinate(text) {
  const m = String(text).match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  const point = m && { lat: Number(m[1]), lon: Number(m[2]) };
  return validPoint(point) ? { ...point, label: text } : null;
}
export function routeCapability(profile, preview = false, settings = {}) {
  const mode = settings.travelMode || 'car';
  if (!['car', 'foot', 'bike'].includes(mode))
    throw new Error('Choose driving, walking, or cycling.');
  if (mode === 'foot')
    return 'Walking route · check current access and conditions';
  if (mode === 'bike')
    return 'Cycling route · check current access and conditions';
  if (normalizeValhallaUrl(settings.valhallaUrl)) {
    valhallaCosting(profile, settings);
    return 'Configured Valhalla routing · restriction completeness and permits unverified';
  }
  if (profile.avoidTolls || profile.excludeTolls)
    throw new Error(
      'Toll avoidance needs a routing provider that supports it. The public road provider cannot enforce this preference.',
    );
  if (
    (profile.type !== 'car' || profile.hazmat || profile.oversize) &&
    !preview
  )
    throw new Error(
      'Truck, hazmat and oversize clearance requires a qualified truck routing provider. Enable passenger-road preview only to inspect roads; it is not a truck route.',
    );
  return profile.type === 'car' && !profile.hazmat && !profile.oversize
    ? 'Passenger-car road route · no live traffic'
    : 'PASSENGER-ROAD PREVIEW · truck restrictions and permits NOT verified';
}
export function fuelEstimate(distanceM, mpg, price) {
  if (
    !Number.isFinite(distanceM) ||
    distanceM < 0 ||
    !Number.isFinite(mpg) ||
    mpg <= 0
  )
    return null;
  const miles = distanceM / 1609.344,
    gallons = miles / mpg;
  return {
    miles,
    gallons,
    cost: Number.isFinite(price) && price > 0 ? gallons * price : null,
  };
}
export function formatFuelPriceProvenance(provenance) {
  const source = String(provenance || '')
    .trim()
    .slice(0, 400);
  if (!source) return 'Manual price; no station quote supplied.';
  const qualifier = /^EIA\b/i.test(source)
    ? 'Regional benchmark, not a station quote.'
    : /^Reported Station Price\b/i.test(source)
      ? 'User report, confirm current pump price.'
      : 'Confirm source and current pump price.';
  return `${source}. ${qualifier}`;
}
export function moveStop(stops, from, to) {
  const next = stops.slice();
  if (from < 0 || to < 0 || from >= next.length || to >= next.length)
    return next;
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
/** Local autocomplete never sends keystrokes to the public address provider. */
export function addressSuggestions(query, records = []) {
  const needle = String(query || '')
    .trim()
    .toLocaleLowerCase();
  if (needle.length < 2) return [];
  const seen = new Set();
  return records
    .filter((record) => {
      const label = String(record.address || record.label || '').trim();
      const key = label.toLocaleLowerCase();
      if (!key.includes(needle) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}
// Held–Karp on directed road distances: fixed start/end; no straight-line heuristic.
export function optimizeStopOrder(matrix) {
  const n = matrix?.length;
  if (
    !Number.isInteger(n) ||
    n < 2 ||
    n > MAX_STOPS ||
    matrix.some((r) => !Array.isArray(r) || r.length !== n)
  )
    throw new Error('Need a square road-distance matrix for 2–12 stops.');
  const edge = (a, b) =>
    Number.isFinite(matrix[a][b]) && matrix[a][b] >= 0
      ? matrix[a][b]
      : Infinity;
  const count = n - 2,
    full = (1 << count) - 1;
  if (!count) {
    if (!Number.isFinite(edge(0, 1)))
      throw new Error('No connected road route.');
    return { order: [0, 1], distanceM: edge(0, 1) };
  }
  const dp = Array.from({ length: full + 1 }, () =>
    Array(count).fill(Infinity),
  );
  const previous = Array.from({ length: full + 1 }, () =>
    Array(count).fill(-1),
  );
  for (let j = 0; j < count; j++) dp[1 << j][j] = edge(0, j + 1);
  for (let mask = 1; mask <= full; mask++)
    for (let j = 0; j < count; j++)
      if (mask & (1 << j)) {
        const rest = mask ^ (1 << j);
        if (!rest) continue;
        for (let k = 0; k < count; k++)
          if (rest & (1 << k)) {
            const cost = dp[rest][k] + edge(k + 1, j + 1);
            if (cost < dp[mask][j]) {
              dp[mask][j] = cost;
              previous[mask][j] = k;
            }
          }
      }
  let end = -1,
    distanceM = Infinity;
  for (let j = 0; j < count; j++) {
    const cost = dp[full][j] + edge(j + 1, n - 1);
    if (cost < distanceM) {
      distanceM = cost;
      end = j;
    }
  }
  if (end < 0) throw new Error('No connected road route through all stops.');
  const middle = [];
  let mask = full;
  while (end >= 0) {
    middle.push(end + 1);
    const prior = previous[mask][end];
    mask ^= 1 << end;
    end = prior;
  }
  return { order: [0, ...middle.reverse(), n - 1], distanceM };
}

export function createRouteClient({
  fetchImpl = (...args) => fetch(...args),
  routingBase = import.meta.env?.VITE_LEEWAY_ROUTE_BASE || '',
  geocodingUrl = import.meta.env?.VITE_LEEWAY_GEOCODING_URL ||
    'https://nominatim.openstreetmap.org/search',
  reverseGeocodingUrl = import.meta.env?.VITE_LEEWAY_REVERSE_GEOCODING_URL ||
    geocodingUrl.replace(/\/search\/?$/, '/reverse'),
  valhallaUrl = import.meta.env?.VITE_LEEWAY_VALHALLA_URL || '',
} = {}) {
  let nextGeocode = 0;
  const cache = new Map();
  async function json(url, signal) {
    const timeout = AbortSignal.timeout(25000);
    const response = await fetchImpl(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok)
      throw new Error(
        `Map provider unavailable (HTTP ${response.status}). Please retry later.`,
      );
    return response.json();
  }
  function coordinates(stops) {
    if (
      stops.length < 2 ||
      stops.length > MAX_STOPS ||
      !stops.every(validPoint)
    )
      throw new Error('Select 2–12 valid locations.');
    return stops.map((p) => `${p.lon},${p.lat}`).join(';');
  }
  return {
    async search(query, { signal } = {}) {
      signal?.throwIfAborted();
      const key = addressText(query);
      if (cache.has(key)) return cache.get(key);
      const now = Date.now(),
        slot = Math.max(now, nextGeocode);
      nextGeocode = slot + 1100;
      if (slot > now)
        await new Promise((resolve) => setTimeout(resolve, slot - now));
      signal?.throwIfAborted();
      const rows = await json(
        `${geocodingUrl}?${new URLSearchParams({ q: key, format: 'jsonv2', limit: '5' })}`,
        signal,
      );
      if (!Array.isArray(rows)) throw new Error('Invalid address response.');
      const points = rows
        .map((p) => ({
          lat: Number(p.lat),
          lon: Number(p.lon),
          label: String(p.display_name),
        }))
        .filter(validPoint);
      cache.set(key, points);
      return points;
    },
    async reverse(point, { signal } = {}) {
      if (!validPoint(point)) throw new Error('Location is unavailable.');
      if (reverseGeocodingUrl === geocodingUrl)
        throw new Error('Reverse-address provider is not configured.');
      const key = `reverse:${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
      if (cache.has(key)) return cache.get(key);
      const now = Date.now(),
        slot = Math.max(now, nextGeocode);
      nextGeocode = slot + 1100;
      if (slot > now)
        await new Promise((resolve) => setTimeout(resolve, slot - now));
      signal?.throwIfAborted();
      const row = await json(
        `${reverseGeocodingUrl}?${new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), format: 'jsonv2', zoom: '18' })}`,
        signal,
      );
      if (!row?.display_name)
        throw new Error('No street address was found for that location.');
      const result = { ...point, label: addressText(row.display_name) };
      cache.set(key, result);
      return result;
    },
    async route(
      stops,
      {
        signal,
        profile = DEFAULT_VEHICLE,
        preview = false,
        valhallaUrl: endpoint = valhallaUrl,
        hardExclusionsEnabled = false,
        travelMode = 'car',
      } = {},
    ) {
      const settings = {
        valhallaUrl: endpoint,
        hardExclusionsEnabled,
        travelMode,
      };
      if (travelMode === 'car' && normalizeValhallaUrl(endpoint)) {
        routeCapability(profile, preview, settings);
        const body = await requestValhalla(
          endpoint,
          'route',
          valhallaRequest(stops, profile, settings),
          { fetchImpl, signal },
        );
        return normalizeValhallaRoute(body, profile);
      }
      const authority = routeCapability(profile, preview, { travelMode });
      const coords = coordinates(stops);
      const useProxy = !routingBase || travelMode !== 'car';
      const body = await json(
        useProxy
          ? `/api/route?${new URLSearchParams({ profile: travelMode, coords, steps: '1' })}`
          : `${routingBase}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`,
        signal,
      );
      if (useProxy) {
        if (
          body?.ok !== true ||
          !Array.isArray(body.geometry) ||
          body.geometry.length < 2 ||
          !body.geometry.every((p) => validPoint({ lon: p[0], lat: p[1] })) ||
          !Number.isFinite(body.distanceM) ||
          body.distanceM < 0 ||
          !Number.isFinite(body.durationS) ||
          body.durationS < 0
        )
          throw new Error(body?.error || 'No usable road route returned.');
        return {
          ...body,
          authority,
          source: 'OSRM / OpenStreetMap',
          travelMode,
          retrievedAt: new Date().toISOString(),
        };
      }
      const route = body?.routes?.[0];
      if (
        body.code !== 'Ok' ||
        !Array.isArray(route?.geometry?.coordinates) ||
        route.geometry.coordinates.length < 2 ||
        !route.geometry.coordinates.every((p) =>
          validPoint({ lon: p[0], lat: p[1] }),
        ) ||
        !Number.isFinite(route.distance) ||
        !Number.isFinite(route.duration)
      )
        throw new Error('No usable road route returned.');
      return {
        geometry: route.geometry.coordinates,
        distanceM: route.distance,
        durationS: route.duration,
        steps: normalizeOsrmSteps(route).steps,
        authority,
        source: 'OSRM / OpenStreetMap',
        retrievedAt: new Date().toISOString(),
      };
    },
    async matrix(
      stops,
      {
        signal,
        profile = DEFAULT_VEHICLE,
        preview = false,
        valhallaUrl: endpoint = valhallaUrl,
        hardExclusionsEnabled = false,
        travelMode = 'car',
      } = {},
    ) {
      if (travelMode !== 'car')
        throw new Error(
          'Stop optimization is available for driving. Walking and cycling keep your stop order.',
        );
      const settings = { valhallaUrl: endpoint, hardExclusionsEnabled };
      if (normalizeValhallaUrl(endpoint)) {
        routeCapability(profile, preview, settings);
        const body = await requestValhalla(
          endpoint,
          'sources_to_targets',
          valhallaRequest(stops, profile, settings, true),
          { fetchImpl, signal },
        );
        return normalizeValhallaMatrix(body, stops.length);
      }
      routeCapability(profile, preview);
      const body = await json(
        `${routingBase || 'https://router.project-osrm.org'}/table/v1/driving/${coordinates(stops)}?annotations=distance`,
        signal,
      );
      if (body.code !== 'Ok' || !Array.isArray(body.distances))
        throw new Error(
          'Road-distance optimization is unavailable from this provider.',
        );
      return body.distances;
    },
  };
}
