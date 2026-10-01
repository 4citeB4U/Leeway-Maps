import { haversineKm } from '../common/geo.js';

/** Validate public query input before launching any provider downloads. */
export function parseCameraScope(params) {
  if (!params.has('lat') && !params.has('lon')) return null;
  const value = (key) => params.has(key) && params.get(key).trim() !== '' ? Number(params.get(key)) : NaN;
  const lat = value('lat'), lon = value('lon');
  const radiusKm = params.has('radiusKm') ? value('radiusKm') : 180;
  const limit = params.has('limit') ? value('limit') : 4000;
  const includeId = params.get('includeId') || '';
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 ||
      !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 1000 ||
      !Number.isInteger(limit) || limit < 1 || limit > 4000 || includeId.length > 300)
    throw Object.assign(new Error('Invalid camera region: valid lat/lon, radiusKm 1–1000 and limit 1–4000 required.'), { statusCode: 400 });
  return { lat, lon, radiusKm, limit, includeId };
}

/** Filter the full verified inventory BEFORE allocating the render budget. */
export function selectRegionalCameras(inventory, scope) {
  const rows = inventory.map(source => ({ source, distance: haversineKm(scope.lat, scope.lon, source.lat, source.lon) }))
    .filter(row => Number.isFinite(row.distance) && row.distance <= scope.radiusKm)
    .sort((a, b) => a.distance - b.distance || a.source.id.localeCompare(b.source.id));
  const pinned = scope.includeId ? inventory.find(source => source.id === scope.includeId) : null;
  const selected = rows.slice(0, scope.limit).map(row => row.source);
  if (pinned && !selected.some(source => source.id === pinned.id)) {
    if (selected.length >= scope.limit) selected.pop();
    selected.push(pinned);
  }
  const regionalIds = new Set(rows.map(row => row.source.id));
  const regionKept = selected.filter(source => regionalIds.has(source.id)).length;
  return { sources: selected, scope: { lat: scope.lat, lon: scope.lon, radiusKm: scope.radiusKm,
    matchedCount: rows.length, totalAvailable: inventory.length, truncated: regionKept < rows.length } };
}
