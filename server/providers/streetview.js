import { googleServerApiKey } from './places/google-key.js';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function numberParam(searchParams, name, min, max, fallback = null) {
  const raw = searchParams.get(name);
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function streetViewProxy({
  resolveApiKey = googleServerApiKey,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  function install(middlewares) {
    middlewares.use('/api/streetview/image', async (req, res) => {
      if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
      const url = new URL(req.url || '', 'http://localhost');
      const lat = numberParam(url.searchParams, 'lat', -90, 90);
      const lon = numberParam(url.searchParams, 'lon', -180, 180);
      const heading = numberParam(url.searchParams, 'heading', 0, 360, 0);
      const pitch = numberParam(url.searchParams, 'pitch', -90, 90, 0);
      const fov = numberParam(url.searchParams, 'fov', 10, 120, 90);
      if ([lat, lon, heading, pitch, fov].some((v) => v == null))
        return json(res, 400, { error: 'Valid lat/lon/heading/pitch/fov required' });
      const apiKey = String(resolveApiKey() || '').trim();
      if (!apiKey) return json(res, 503, { error: 'Street View is not configured' });
      const target = new URL('https://maps.googleapis.com/maps/api/streetview');
      target.searchParams.set('size', '640x640');
      target.searchParams.set('location', `${lat},${lon}`);
      target.searchParams.set('heading', String(heading));
      target.searchParams.set('pitch', String(pitch));
      target.searchParams.set('fov', String(fov));
      target.searchParams.set('source', 'outdoor');
      target.searchParams.set('return_error_code', 'true');
      target.searchParams.set('key', apiKey);
      try {
        const upstream = await fetchImpl(target, {
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
          headers: { Accept: 'image/jpeg,image/*' },
        });
        if (!upstream.ok) return json(res, upstream.status, { error: 'Street View image unavailable' });
        const type = upstream.headers.get('content-type') || '';
        if (!type.startsWith('image/')) return json(res, 502, { error: 'Street View returned non-image data' });
        const bytes = Buffer.from(await upstream.arrayBuffer());
        if (!bytes.length || bytes.length > 8 * 1024 * 1024)
          return json(res, 502, { error: 'Street View image size invalid' });
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.end(bytes);
      } catch {
        return json(res, 502, { error: 'Street View request failed' });
      }
    });
  }
  return {
    name: 'street-view-proxy',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
}
