import { createAlertOverlay } from '../alerts/overlay.js';
export const INCIDENT_LAYER_URL =
  'https://services2.arcgis.com/aIrBD8yn1TDTEXoz/ArcGIS/rest/services/Travel_Midwest_Unplanned_Events/FeatureServer/0';
export function normalizeTrafficIncidents(payload, metadata, now = Date.now()) {
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features))
    throw new Error('Invalid IDOT incident feed');
  const updatedAt = metadata?.editingInfo?.dataLastEditDate || null;
  const stale = !Number.isFinite(updatedAt) || now - updatedAt > 3600000;
  const records = payload.features.slice(0, 500).flatMap((f) => {
    const p = f.properties || {},
      c = f.geometry?.coordinates;
    if (
      stale ||
      !Array.isArray(c) ||
      c.length !== 2 ||
      !c.every(Number.isFinite) ||
      Math.abs(c[0]) > 180 ||
      Math.abs(c[1]) > 90 ||
      !Number.isFinite(p.EndDate) ||
      p.EndDate <= now ||
      /closed|cleared|ended/i.test(p.Status || '')
    )
      return [];
    return [
      {
        id: `idot-incident:${p.id || f.id}`,
        name: p.FullClosure === 'True' ? 'Road closure' : 'Traffic incident',
        geometry: { type: 'Point', coordinates: c },
        expiresAt: p.EndDate,
        color: '#ff9933',
        text: [
          p.Description,
          p.Location,
          `Status: ${p.Status || 'Unknown'}`,
          `Starts: ${Number.isFinite(p.StartDate) ? new Date(p.StartDate).toISOString() : 'Unknown'}\nEnds: ${new Date(p.EndDate).toISOString()}`,
          `Source: ${p.Source || 'IDOT'} / Travel Midwest`,
          `Feed last edited: ${new Date(updatedAt).toISOString()}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ];
  });
  return {
    records,
    updatedAt,
    fetchedAt: now,
    stale,
    unmapped: 0,
    note: stale
      ? 'Illinois source is stale; expired or unverified incident markers are hidden. Not nationwide coverage.'
      : 'Illinois emergency/unplanned events only. Up to 500 records; not nationwide coverage.',
  };
}
export function createTrafficIncidentsLayer({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ...options
} = {}) {
  return createAlertOverlay({
    id: 'traffic-incidents',
    name: 'Illinois Traffic Incidents',
    source: 'IDOT / Travel Midwest',
    now,
    ...options,
    load: async ({ signal }) => {
      const urls = [
        `${INCIDENT_LAYER_URL}?f=json`,
        `${INCIDENT_LAYER_URL}/query?where=1%3D1&outFields=*&outSR=4326&resultRecordCount=500&f=geojson`,
      ];
      const values = await Promise.all(
        urls.map(async (url) => {
          const r = await fetchImpl(url, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
          });
          if (!r.ok) throw new Error(`IDOT HTTP ${r.status}`);
          return r.json();
        }),
      );
      return normalizeTrafficIncidents(values[1], values[0], now());
    },
  });
}
