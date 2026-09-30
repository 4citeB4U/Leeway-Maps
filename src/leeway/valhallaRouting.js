// Contracts: https://valhalla.github.io/valhalla/api/route/api-reference/
// https://github.com/valhalla/valhalla/blob/master/docs/docs/api/openapi.yaml
// Truck costing applies mapped restrictions; it cannot certify missing OSM data.
export function normalizeValhallaUrl(value) {
  if (!String(value || '').trim()) return '';
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error('Enter a valid Valhalla server URL.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Use an HTTPS Valhalla endpoint, or HTTP loopback for local testing, without embedded credentials.',
    );
  return url.href.replace(/\/$/, '');
}
export const isCommercial = (p) => p.type !== 'car' || p.hazmat || p.oversize;
export function valhallaCosting(
  profile,
  { hardExclusionsEnabled = false } = {},
) {
  const costing = isCommercial(profile) ? 'truck' : 'auto';
  const options = { use_tolls: profile.avoidTolls ? 0 : 0.5 };
  if (profile.excludeTolls) {
    if (!hardExclusionsEnabled)
      throw new Error(
        'Hard toll exclusion requires server service_limits.allow_hard_exclusions. Confirm that server setting first.',
      );
    options.exclude_tolls = true;
  }
  if (costing === 'truck') {
    for (const key of [
      'heightM',
      'widthM',
      'lengthM',
      'grossWeightKg',
      'axleWeightKg',
    ])
      if (!Number.isFinite(profile[key]) || profile[key] <= 0)
        throw new Error(
          'Truck dimensions, gross weight and axle load must be positive.',
        );
    if (
      !Number.isInteger(profile.axleCount) ||
      profile.axleCount < 2 ||
      profile.axleCount > 20 ||
      profile.axleWeightKg > 40000
    )
      throw new Error(
        'Valhalla requires 2–20 axles and axle load at most 40 metric tonnes.',
      );
    Object.assign(options, {
      height: profile.heightM,
      width: profile.widthM,
      length: profile.lengthM,
      weight: profile.grossWeightKg / 1000,
      axle_load: profile.axleWeightKg / 1000,
      axle_count: profile.axleCount,
      hazmat: !!profile.hazmat,
    });
  }
  return {
    costing,
    costing_options: { [costing]: options },
    units: 'kilometers',
  };
}
export function valhallaRequest(stops, profile, settings = {}, matrix = false) {
  if (
    !Array.isArray(stops) ||
    stops.length < 2 ||
    stops.length > 12 ||
    stops.some(
      (p) =>
        !Number.isFinite(p?.lat) ||
        !Number.isFinite(p?.lon) ||
        Math.abs(p.lat) > 90 ||
        Math.abs(p.lon) > 180,
    )
  )
    throw new Error('Select 2–12 valid locations.');
  const locations = stops.map(({ lat, lon }) => ({ lat, lon, type: 'break' }));
  return {
    ...valhallaCosting(profile, settings),
    ...(matrix
      ? { sources: locations, targets: locations, verbose: true }
      : {
          locations,
          language: 'en-US',
        }),
  };
}
export function rejectValhallaWarnings(body) {
  for (const value of [body?.warnings, body?.trip?.warnings]) {
    if (value != null && !Array.isArray(value))
      throw new Error('Invalid Valhalla warning envelope; route not accepted.');
  }
  const warnings = [...(body?.warnings || []), ...(body?.trip?.warnings || [])];
  if (warnings.length)
    throw new Error(
      `Valhalla did not accept the request cleanly: ${warnings.map((w) => (typeof w === 'string' ? w : w?.description || w?.message || w?.text || JSON.stringify(w))).join('; ')}. Route not accepted because vehicle or exclusion options may have been ignored.`,
    );
  if (body?.error || body?.error_code)
    throw new Error(`Valhalla: ${body.error || body.error_code}`);
}
export function decodePolyline6(shape) {
  if (typeof shape !== 'string' || !shape.length)
    throw new Error('Valhalla returned no route shape.');
  let i = 0,
    lat = 0,
    lon = 0;
  const points = [];
  function component() {
    let value = 0,
      shift = 0,
      byte;
    do {
      if (i >= shape.length || shift > 30)
        throw new Error('Invalid Valhalla polyline6.');
      byte = shape.charCodeAt(i++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid Valhalla polyline6.');
      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return value % 2 ? -(Math.floor(value / 2) + 1) : value / 2;
  }
  while (i < shape.length) {
    lat += component();
    lon += component();
    const p = [lon / 1e6, lat / 1e6];
    if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
      throw new Error('Invalid Valhalla coordinate.');
    points.push(p);
  }
  return points;
}
export function normalizeValhallaRoute(body, profile) {
  rejectValhallaWarnings(body);
  const trip = body?.trip;
  if (
    trip?.status !== 0 ||
    trip.units !== 'kilometers' ||
    !Array.isArray(trip.legs) ||
    !Number.isFinite(trip.summary?.length) ||
    trip.summary.length < 0 ||
    !Number.isFinite(trip.summary?.time) ||
    trip.summary.time < 0
  )
    throw new Error('Valhalla returned no usable route in requested units.');
  if (profile.excludeTolls && trip.summary.has_toll !== false)
    throw new Error(
      'Hard toll exclusion was requested, but this route contains tolls or lacks toll evidence. Start/end toll segments also prevent acceptance.',
    );
  const geometry = [],
    steps = [];
  for (const leg of trip.legs) {
    const points = decodePolyline6(leg.shape);
    const joined =
      geometry.length &&
      points[0]?.[0] === geometry.at(-1)[0] &&
      points[0]?.[1] === geometry.at(-1)[1]
        ? points.slice(1)
        : points;
    for (const point of joined) geometry.push(point);
    for (const step of leg.maneuvers || [])
      steps.push({
        instruction: String(step.instruction || 'Continue'),
        distanceM: Number(step.length || 0) * 1000,
        durationS: Number(step.time || 0),
        lon: points[step.begin_shape_index]?.[0],
        lat: points[step.begin_shape_index]?.[1],
      });
  }
  if (geometry.length < 2)
    throw new Error('Valhalla returned insufficient road geometry.');
  return {
    geometry,
    steps,
    distanceM: trip.summary.length * 1000,
    durationS: trip.summary.time,
    source: 'Configured Valhalla / OpenStreetMap',
    authority: isCommercial(profile)
      ? 'Valhalla truck costing · mapped restrictions applied; complete clearance and permits UNVERIFIED'
      : 'Valhalla passenger route · live traffic not verified',
    restrictionEvidence: 'MAPPED_RESTRICTIONS_ONLY',
    truckSafeVerified: false,
    oversizePermitVerified: false,
    hasTolls: trip.summary.has_toll ?? null,
    retrievedAt: new Date().toISOString(),
  };
}
export function normalizeValhallaMatrix(body, count) {
  rejectValhallaWarnings(body);
  if (
    body?.units !== 'kilometers' ||
    !Array.isArray(body.sources_to_targets) ||
    body.sources_to_targets.length !== count
  )
    throw new Error('Invalid Valhalla distance matrix or units.');
  return body.sources_to_targets.map((row, sourceIndex) => {
    if (!Array.isArray(row) || row.length !== count)
      throw new Error('Incomplete Valhalla distance matrix.');
    return row.map((cell, targetIndex) => {
      if (
        (cell?.from_index !== undefined && cell.from_index !== sourceIndex) ||
        (cell?.to_index !== undefined && cell.to_index !== targetIndex)
      )
        throw new Error(
          'Valhalla matrix location order does not match the requested stops.',
        );
      if (cell?.distance === null) return null;
      if (!Number.isFinite(cell?.distance) || cell.distance < 0)
        throw new Error('Invalid Valhalla matrix distance.');
      return cell.distance * 1000;
    });
  });
}
export async function requestValhalla(
  endpoint,
  operation,
  payload,
  { fetchImpl = (...args) => fetch(...args), signal } = {},
) {
  const base = normalizeValhallaUrl(endpoint),
    timeout = AbortSignal.timeout(30000);
  if (!base || !['route', 'sources_to_targets'].includes(operation))
    throw new Error(
      'A configured Valhalla endpoint and supported operation are required.',
    );
  const response = await fetchImpl(`${base}/${operation}`, {
    method: 'POST',
    // Valhalla parses the JSON body with text/plain too. This CORS-safelisted
    // type avoids an OPTIONS preflight unsupported by the official server.
    headers: { Accept: 'application/json', 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `Valhalla HTTP ${response.status}. Check server reachability, CORS, region coverage and vehicle profile; no passenger fallback was used.`,
    );
  return response.json();
}
