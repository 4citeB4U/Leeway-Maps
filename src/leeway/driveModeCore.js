const R = 6371000;
const radians = (value) => (value * Math.PI) / 180;
const wrapLongitude = (value) => ((value + 540) % 360) - 180;
export function distanceMeters(a, b) {
  const lat = radians(b[1] - a[1]),
    lon = radians(wrapLongitude(b[0] - a[0]));
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const validCoordinate = (value) =>
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;

export function prepareDriveRoute(route) {
  const geometry = route?.geometry;
  if (
    !Array.isArray(geometry) ||
    geometry.length < 2 ||
    !geometry.every(validCoordinate)
  )
    throw new Error('Calculate a road route before starting Drive Mode.');
  const cumulative = [0];
  for (let i = 1; i < geometry.length; i++)
    cumulative.push(
      cumulative.at(-1) + distanceMeters(geometry[i - 1], geometry[i]),
    );
  if (cumulative.at(-1) < 1)
    throw new Error('This route has no measurable road distance.');
  const prepared = {
    geometry,
    cumulative,
    totalM: cumulative.at(-1),
    distanceM:
      Number(route.distanceM) > 0 ? Number(route.distanceM) : cumulative.at(-1),
    steps: [],
  };
  let progress = 0;
  for (const step of route.steps || []) {
    if (!validCoordinate([step.lon, step.lat])) continue;
    const snapped = projectOnRoute(prepared, [step.lon, step.lat], {
      previousM: progress,
      minimumM: progress - 10,
    });
    if (!snapped) continue;
    progress = Math.max(progress, snapped.progressM);
    prepared.steps.push({
      progressM: progress,
      instruction: String(step.instruction || 'Continue on the route'),
      type: step.type || '',
      modifier: step.modifier || '',
    });
  }
  return prepared;
}

/** Geometric route projection, not a provider-certified map-matching service. */
export function projectOnRoute(
  route,
  point,
  { previousM = null, minimumM = 0 } = {},
) {
  let best = null;
  const scaleX = (R * Math.cos(radians(point[1])) * Math.PI) / 180,
    scaleY = (R * Math.PI) / 180;
  for (let i = 0; i < route.geometry.length - 1; i++) {
    const a = route.geometry[i],
      b = route.geometry[i + 1];
    const ax = wrapLongitude(a[0] - point[0]) * scaleX,
      ay = (a[1] - point[1]) * scaleY;
    const bx = ax + wrapLongitude(b[0] - a[0]) * scaleX,
      by = (b[1] - point[1]) * scaleY;
    const dx = bx - ax,
      dy = by - ay,
      length2 = dx * dx + dy * dy;
    const t =
      length2 > 0
        ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2))
        : 0;
    const distanceM = Math.hypot(ax + dx * t, ay + dy * t);
    const progressM =
      route.cumulative[i] + (route.cumulative[i + 1] - route.cumulative[i]) * t;
    if (progressM < minimumM) continue;
    // At overlapping roads/intersections prefer continuity, not a later loop.
    const tie =
      previousM === null ? progressM : Math.abs(progressM - previousM);
    if (
      !best ||
      distanceM < best.distanceM - 5 ||
      (Math.abs(distanceM - best.distanceM) <= 5 && tie < best.tie)
    )
      best = { distanceM, progressM, tie, segment: i };
  }
  return best;
}

export function drivePosition(
  route,
  position,
  { now = Date.now(), previousM = null } = {},
) {
  const coords = position?.coords;
  const point = [coords?.longitude, coords?.latitude];
  if (
    !validCoordinate(point) ||
    !Number.isFinite(position?.timestamp) ||
    now - position.timestamp > 15000 ||
    position.timestamp > now + 5000
  )
    return {
      state: 'stale',
      speedMps: null,
      message: 'Waiting for a fresh GPS location',
    };
  const speedMps =
    Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null;
  if (
    !Number.isFinite(coords.accuracy) ||
    coords.accuracy > 80 ||
    coords.accuracy < 0
  )
    return {
      state: 'uncertain',
      speedMps,
      message: 'GPS accuracy is low — guidance paused',
    };
  const snap = projectOnRoute(route, point, { previousM });
  if (!snap || snap.distanceM > Math.max(60, coords.accuracy * 2))
    return {
      state: 'off-route',
      speedMps,
      message: 'Off route — stop safely to replan',
      distanceFromRouteM: snap?.distanceM,
    };
  const remainingM = Math.max(
    0,
    ((route.totalM - snap.progressM) / route.totalM) * route.distanceM,
  );
  const next = route.steps.find((step) => step.progressM > snap.progressM + 12);
  const departure =
    snap.progressM < 20
      ? route.steps.find((step) => step.type === 'depart')
      : null;
  const maneuver = departure || next;
  return {
    state: remainingM < 40 ? 'near-destination' : 'guiding',
    speedMps,
    progressM: snap.progressM,
    remainingM,
    nextDistanceM: maneuver
      ? Math.max(0, maneuver.progressM - snap.progressM)
      : null,
    instruction:
      remainingM < 40
        ? 'Destination nearby — confirm arrival'
        : maneuver?.instruction || 'Continue on the displayed route',
    modifier: maneuver?.modifier || '',
    point,
    accuracyM: coords.accuracy,
    heading:
      Number.isFinite(coords.heading) && coords.heading >= 0
        ? coords.heading
        : null,
  };
}

export function createDriveSession({
  geolocation = globalThis.navigator?.geolocation,
  onUpdate = () => {},
  now = () => Date.now(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  let watch = null,
    timer = null,
    epoch = 0,
    lastPosition = null,
    lastProgress = null,
    route = null;
  function stop() {
    epoch++;
    if (watch !== null) geolocation?.clearWatch(watch);
    watch = null;
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
    lastPosition = null;
    lastProgress = null;
  }
  function start(value) {
    stop();
    route = prepareDriveRoute(value);
    if (!geolocation) {
      onUpdate({
        state: 'unavailable',
        speedMps: null,
        message: 'This browser does not provide GPS location.',
      });
      return false;
    }
    const own = epoch;
    onUpdate({
      state: 'locating',
      speedMps: null,
      message: 'Allow location access to start Drive Mode',
    });
    watch = geolocation.watchPosition(
      (position) => {
        if (own !== epoch) return;
        lastPosition = position;
        const update = drivePosition(route, position, {
          now: now(),
          previousM: lastProgress,
        });
        if (update.progressM != null) lastProgress = update.progressM;
        onUpdate(update);
      },
      (error) => {
        if (own !== epoch) return;
        lastPosition = null;
        onUpdate({
          state: error.code === 1 ? 'denied' : 'unavailable',
          speedMps: null,
          message:
            error.code === 1
              ? 'Location permission denied. Exit and allow location in browser settings.'
              : 'GPS unavailable — guidance paused',
        });
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    timer = setIntervalImpl(() => {
      if (
        own === epoch &&
        lastPosition &&
        now() - lastPosition.timestamp > 15000
      ) {
        lastPosition = null;
        onUpdate({
          state: 'stale',
          speedMps: null,
          message: 'GPS signal lost — guidance paused',
        });
      }
    }, 3000);
    return true;
  }
  return { start, stop };
}
