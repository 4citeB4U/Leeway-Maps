export const OFFLINE_TRIP_KEY = 'leeway.logistics.offlineTrip.v1';
export const LIMITS = Object.freeze({
  points: 20000,
  steps: 500,
  stops: 12,
  characters: 1000000,
  staleMs: 86400000,
});
const clean = (value, limit = 240) =>
  String(value || '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .slice(0, limit);
const coord = (point) =>
  Array.isArray(point) &&
  point.length === 2 &&
  point.every(Number.isFinite) &&
  Math.abs(point[0]) <= 180 &&
  Math.abs(point[1]) <= 90;
const positive = (value) => Number.isFinite(value) && value >= 0;

export function normalizeTripRoute(route) {
  if (
    !route ||
    !Array.isArray(route.geometry) ||
    route.geometry.length < 2 ||
    route.geometry.length > LIMITS.points ||
    !route.geometry.every(coord)
  )
    throw new Error(
      'Route geometry is missing, invalid or exceeds the 20,000-point offline limit.',
    );
  if (!positive(route.distanceM) || !positive(route.durationS))
    throw new Error('Route distance or duration is invalid.');
  if (!Array.isArray(route.steps) || route.steps.length > LIMITS.steps)
    throw new Error(
      'Route instructions exceed the offline limit or are unavailable.',
    );
  if (
    route.stops != null &&
    (!Array.isArray(route.stops) || route.stops.length > LIMITS.stops)
  )
    throw new Error('Too many offline stops.');
  const steps = route.steps.map((step) => {
    if (
      !step ||
      typeof step.instruction !== 'string' ||
      !positive(step.distanceM ?? 0)
    )
      throw new Error('A saved route instruction is invalid.');
    const result = {
      instruction: clean(step.instruction, 500),
      distanceM: step.distanceM || 0,
      type: clean(step.type, 40),
    };
    if (step.lon != null || step.lat != null) {
      if (!coord([step.lon, step.lat]))
        throw new Error('A route maneuver coordinate is invalid.');
      result.lon = step.lon;
      result.lat = step.lat;
    }
    return result;
  });
  const stops = (route.stops || []).map((stop) => {
    if (!coord([stop.lon, stop.lat]))
      throw new Error('A saved stop coordinate is invalid.');
    return { lon: stop.lon, lat: stop.lat, label: clean(stop.label, 240) };
  });
  return {
    geometry: route.geometry.map((point) => [...point]),
    distanceM: route.distanceM,
    durationS: route.durationS,
    steps,
    stops,
    source: clean(route.source),
    authority: clean(route.authority),
    preview: !!route.preview,
    vehicleType: clean(route.vehicle?.type || route.vehicleType, 40),
  };
}
export function encodeTrip(route, { now = Date.now(), active = true } = {}) {
  if (!Number.isFinite(now) || now < 0)
    throw new Error('Invalid saved-trip time.');
  const value = {
    version: 1,
    savedAt: now,
    active: !!active,
    route: normalizeTripRoute(route),
  };
  const serialized = JSON.stringify(value);
  if (serialized.length > LIMITS.characters)
    throw new Error('This route exceeds the bounded offline storage size.');
  return serialized;
}
export function decodeTrip(serialized, { now = Date.now() } = {}) {
  if (!serialized) return null;
  if (typeof serialized !== 'string' || serialized.length > LIMITS.characters)
    throw new Error('Saved trip exceeds the size limit.');
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error(
      'Saved trip data is corrupt. Delete it and save a new online route.',
    );
  }
  if (
    value?.version !== 1 ||
    !Number.isFinite(value.savedAt) ||
    value.savedAt < 0 ||
    value.savedAt > now + 300000 ||
    typeof value.active !== 'boolean'
  )
    throw new Error('Saved trip version or time is invalid.');
  return {
    version: 1,
    savedAt: value.savedAt,
    active: value.active,
    stale: now - value.savedAt > LIMITS.staleMs,
    route: normalizeTripRoute(value.route),
  };
}
export function loadTrip(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const trip = decodeTrip(storage.getItem(OFFLINE_TRIP_KEY), { now });
    return { state: trip ? 'saved' : 'empty', trip };
  } catch (error) {
    return { state: 'unavailable', trip: null, error: error.message };
  }
}
export function saveTrip(
  route,
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  const serialized = encodeTrip(route, { now });
  storage.setItem(OFFLINE_TRIP_KEY, serialized);
  return decodeTrip(serialized, { now });
}
export function markTripPrevious(
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  const result = loadTrip(storage, now);
  if (result.trip) {
    const { trip } = result;
    storage.setItem(
      OFFLINE_TRIP_KEY,
      encodeTrip(trip.route, { now: trip.savedAt, active: false }),
    );
  }
  return result.trip;
}
export function deleteTrip(storage = globalThis.localStorage) {
  storage.removeItem(OFFLINE_TRIP_KEY);
}

const rad = (value) => (value * Math.PI) / 180,
  wrap = (value) => ((value + 540) % 360) - 180;
export function meters(a, b) {
  const lat = rad(b[1] - a[1]),
    lon = rad(wrap(b[0] - a[0]));
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(lon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function prepareTripGuidance(route) {
  const distances = [0];
  for (let i = 1; i < route.geometry.length; i++)
    distances.push(
      distances.at(-1) + meters(route.geometry[i - 1], route.geometry[i]),
    );
  const result = {
    ...route,
    distances,
    total: distances.at(-1),
    maneuvers: [],
  };
  if (result.total < 1)
    throw new Error('Saved route has no measurable geometry.');
  let previous = 0;
  for (const step of route.steps) {
    if (!coord([step.lon, step.lat])) continue;
    const snap = projectTrip(
      result,
      [step.lon, step.lat],
      previous,
      previous - 10,
    );
    if (snap) {
      previous = Math.max(previous, snap.progress);
      result.maneuvers.push({ ...step, progress: previous });
    }
  }
  return result;
}
export function projectTrip(route, point, previous = null, minimum = 0) {
  let best = null;
  const sx = 111194.9266 * Math.cos(rad(point[1])),
    sy = 111194.9266;
  for (let i = 0; i < route.geometry.length - 1; i++) {
    const a = route.geometry[i],
      b = route.geometry[i + 1];
    const x = wrap(a[0] - point[0]) * sx,
      y = (a[1] - point[1]) * sy,
      dx = wrap(b[0] - a[0]) * sx,
      dy = (b[1] - a[1]) * sy;
    const length = dx * dx + dy * dy,
      t = length ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length)) : 0;
    const distance = Math.hypot(x + t * dx, y + t * dy),
      progress =
        route.distances[i] + t * (route.distances[i + 1] - route.distances[i]);
    if (progress < minimum) continue;
    const tie = previous === null ? progress : Math.abs(progress - previous);
    if (
      !best ||
      distance < best.distance - 5 ||
      (Math.abs(distance - best.distance) <= 5 && tie < best.tie)
    )
      best = { distance, progress, tie };
  }
  return best;
}
export function offlineGpsState(
  route,
  position,
  { now = Date.now(), previous = null } = {},
) {
  const coords = position?.coords,
    point = [coords?.longitude, coords?.latitude];
  if (
    !coord(point) ||
    !Number.isFinite(position.timestamp) ||
    now - position.timestamp > 15000 ||
    position.timestamp > now + 5000
  )
    return {
      state: 'stale',
      speed: null,
      message: 'Waiting for fresh GPS. Saved directions remain available.',
    };
  const speed =
    Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null;
  if (
    !Number.isFinite(coords.accuracy) ||
    coords.accuracy < 0 ||
    coords.accuracy > 80
  )
    return {
      state: 'uncertain',
      speed,
      message: 'GPS accuracy is low. Guidance paused.',
    };
  const snap = projectTrip(route, point, previous);
  if (!snap || snap.distance > Math.max(60, coords.accuracy * 2))
    return {
      state: 'off-route',
      speed,
      point,
      message:
        'Off the saved route. Reconnect to calculate a new road route; no automatic offline rerouting.',
    };
  const remaining = Math.max(
    0,
    ((route.total - snap.progress) / route.total) * route.distanceM,
  );
  const next = route.maneuvers.find(
    (step) => step.progress > snap.progress + 12,
  );
  const instruction =
    remaining < 40
      ? 'Destination nearby — confirm arrival'
      : next?.instruction || 'Continue along the saved route geometry';
  return {
    state: 'guiding',
    speed,
    point,
    progress: snap.progress,
    remaining,
    nextDistance: next ? next.progress - snap.progress : null,
    message: instruction,
  };
}
