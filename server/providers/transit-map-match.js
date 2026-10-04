import { decodePolyline6, normalizeValhallaUrl } from '../../src/leeway/valhallaRouting.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function endpointFromEnv(env) {
  const raw = env.LEEWAY_VALHALLA_URL || env.VALHALLA_URL || '';
  if (!raw) return '';
  return normalizeValhallaUrl(raw);
}

function validPoint(point) {
  return (
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

export function normalizeTransitMatchRequest(body) {
  const points = Array.isArray(body?.points) ? body.points : [];
  if (
    points.length < 3 ||
    points.length > 12 ||
    points.some((point) => !validPoint(point))
  )
    throw new Error('3–12 valid GPS points are required');
  const mode = String(body?.mode || 'bus').toLowerCase();
  if (mode !== 'bus')
    throw new Error('Road map matching is currently authorized only for buses');
  return {
    mode,
    points: points.map((point) => ({
      lat: Number(point.lat),
      lon: Number(point.lon),
      ...(Number.isFinite(point.time)
        ? { time: Math.round(Number(point.time) / 1000) }
        : {}),
    })),
  };
}

function approximateDistanceM(a, b) {
  const latScale = 111320;
  const lonScale = latScale * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(
    (b.lat - a.lat) * latScale,
    (b.lon - a.lon) * lonScale,
  );
}

function closestDistanceM(point, geometry) {
  let best = Infinity;
  for (const [lon, lat] of geometry) {
    const distance = approximateDistanceM(point, { lat, lon });
    if (distance < best) best = distance;
  }
  return Number.isFinite(best) ? best : null;
}

export function transitMapMatchProxy({
  env = process.env,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  async function handler(req, res) {
    if (req.method !== 'POST')
      return json(res, 405, { error: 'Method not allowed' });
    let base;
    try {
      base = endpointFromEnv(env);
    } catch {
      return json(res, 503, { error: 'Configured Valhalla URL is invalid' });
    }
    if (!base)
      return json(res, 503, {
        status: 'not-configured',
        error: 'Transit map matching requires LEEWAY_VALHALLA_URL',
      });

    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 64 * 1024)
        return json(res, 413, { error: 'Map-match request too large' });
    }
    let input;
    try {
      input = normalizeTransitMatchRequest(JSON.parse(text || '{}'));
    } catch (error) {
      return json(res, 400, { error: error.message });
    }

    const payload = {
      shape: input.points,
      costing: 'auto',
      shape_match: 'map_snap',
      use_timestamps: input.points.every((point) => Number.isFinite(point.time)),
      filters: {
        action: 'include',
        attributes: ['shape', 'matched.point', 'matched.distance_from_trace_point'],
      },
    };
    try {
      const response = await fetchImpl(base + '/trace_attributes', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
        redirect: 'error',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        return json(res, 502, {
          error: 'Valhalla map matching unavailable',
          upstreamStatus: response.status,
        });
      const geometry = decodePolyline6(data?.shape || '');
      if (geometry.length < 2)
        return json(res, 502, { error: 'Valhalla returned no matched road geometry' });
      const deviations = input.points
        .map((point) => closestDistanceM(point, geometry))
        .filter(Number.isFinite);
      const maxDeviationM = deviations.length ? Math.max(...deviations) : null;
      const meanDeviationM = deviations.length
        ? deviations.reduce((sum, value) => sum + value, 0) / deviations.length
        : null;
      return json(res, 200, {
        ok: true,
        source: 'Valhalla Meili / OpenStreetMap',
        evidence: 'DERIVED_MAP_MATCH',
        rawPointCount: input.points.length,
        geometry,
        meanDeviationM,
        maxDeviationM,
        retrievedAt: new Date().toISOString(),
      });
    } catch {
      return json(res, 502, { error: 'Valhalla map matching request failed' });
    }
  }

  function install(server) {
    server.middlewares.use('/api/transit/map-match', handler);
  }

  return {
    name: 'transit-map-match',
    configureServer: install,
    configurePreviewServer: install,
  };
}
