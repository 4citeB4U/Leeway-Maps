import { createAlertOverlay } from '../alerts/overlay.js';
export const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active';
const time = (value) =>
  Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function validAlertGeometry(geometry) {
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) return null;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let points = 0;
  if (!Array.isArray(polygons) || !polygons.length || polygons.length > 100)
    return null;
  for (const rings of polygons) {
    if (!Array.isArray(rings) || !rings.length) return null;
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      for (const p of ring) {
        if (
          ++points > 50000 ||
          !Array.isArray(p) ||
          p.length !== 2 ||
          !p.every(Number.isFinite) ||
          Math.abs(p[0]) > 180 ||
          Math.abs(p[1]) > 90
        )
          return null;
      }
    }
  }
  return geometry;
}
export function normalizeWeatherAlerts(payload, now = Date.now()) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features))
    throw new Error('Invalid NWS alert feed');
  const records = [],
    seen = new Set();
  for (const feature of payload.features.slice(0, 2000)) {
    const p = feature.properties || {},
      id = String(feature.id || p.id || '');
    const expires = time(p.expires),
      ends = time(p.ends);
    const expiresAt =
      expires === null ? null : Math.min(expires, ends ?? Infinity);
    if (
      !id ||
      seen.has(id) ||
      p.status !== 'Actual' ||
      p.messageType === 'Cancel' ||
      expiresAt === null ||
      expiresAt <= now
    )
      continue;
    seen.add(id);
    const geometry = validAlertGeometry(feature.geometry);
    records.push({
      id,
      name: String(p.event || 'NWS alert'),
      geometry,
      expiresAt,
      color:
        p.severity === 'Extreme'
          ? '#ff4081'
          : p.severity === 'Severe'
            ? '#ff6633'
            : '#ffc857',
      text: [
        p.headline,
        p.areaDesc,
        `Severity: ${p.severity || 'Unknown'} · ${p.urgency || 'Unknown'} · ${p.certainty || 'Unknown'}`,
        `Issued: ${p.sent || 'Unavailable'}\nExpires: ${new Date(expiresAt).toISOString()}`,
        p.description,
        p.instruction,
        `Source: ${p.senderName || 'National Weather Service'}`,
        geometry
          ? ''
          : 'No alert polygon supplied by NWS; see the named affected areas.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  }
  const updatedAt = time(payload.updated);
  return {
    records,
    unmapped: records.filter((r) => !r.geometry).length,
    updatedAt,
    fetchedAt: now,
    stale: updatedAt === null || now - updatedAt > 900000,
    note:
      payload.features.length > 2000
        ? 'Bounded to 2,000 records.'
        : 'US NWS coverage; issued alerts, not a forecast.',
  };
}
export function createWeatherAlertsLayer({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ...options
} = {}) {
  return createAlertOverlay({
    id: 'weather-alerts',
    name: 'NWS Weather Alerts',
    source: 'NOAA / National Weather Service',
    now,
    ...options,
    load: async ({ signal }) => {
      const response = await fetchImpl(NWS_ALERTS_URL, {
        headers: { Accept: 'application/geo+json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error(`NWS alerts HTTP ${response.status}`);
      return normalizeWeatherAlerts(await response.json(), now());
    },
  });
}
