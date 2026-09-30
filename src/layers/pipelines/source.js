const OVERPASS_URL = '/api/overpass';
const QUERY_LIMIT = 1200;
const MAX_VIEWPORT_DEGREES = 3;

export function buildPipelineQuery({ south, west, north, east }) {
  return `[out:json][timeout:20];way["man_made"="pipeline"](${south},${west},${north},${east});out geom ${QUERY_LIMIT};`;
}

export function normalizePipelineWay(element) {
  if (element?.type !== 'way' || !Array.isArray(element.geometry)) return null;
  const geometry = element.geometry
    .map((point) => ({ lat: Number(point?.lat), lon: Number(point?.lon) }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon),
    );
  if (geometry.length < 2) return null;
  const tags = element.tags || {};
  return {
    id: `osm-pipeline-${element.id}`,
    osmId: element.id,
    geometry,
    name: String(tags.name || tags.ref || 'Mapped pipeline'),
    ref: String(tags.ref || ''),
    operator: String(tags.operator || ''),
    substance: String(tags.substance || ''),
    usage: String(tags.usage || ''),
    location: String(tags.location || ''),
  };
}

export function createPipelineSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'OpenStreetMap pipelines',
    async fetch(box, signal) {
      if (
        !box ||
        ![box.south, box.west, box.north, box.east].every(Number.isFinite) ||
        box.north <= box.south ||
        box.east <= box.west ||
        box.north - box.south > MAX_VIEWPORT_DEGREES ||
        box.east - box.west > MAX_VIEWPORT_DEGREES
      ) {
        return {
          records: [],
          status: 'zoom-in',
          stale: false,
          saturated: false,
        };
      }
      const response = await fetchImpl(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(buildPipelineQuery(box))}`,
        signal,
      });
      if (!response.ok)
        throw new Error(`Pipeline Overpass HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.elements) || payload.remark) {
        throw new Error('Pipeline Overpass response incomplete');
      }
      const records = payload.elements
        .map(normalizePipelineWay)
        .filter(Boolean);
      return {
        records,
        status: records.length ? 'ready' : 'empty',
        stale: response.headers.get('x-overpass-cache') === 'STALE',
        saturated: payload.elements.length >= QUERY_LIMIT,
      };
    },
  };
}
