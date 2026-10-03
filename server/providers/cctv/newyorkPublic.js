import { readResponseJsonCapped } from '../common/http.js';
import { CCTV_SOURCE_FETCH_TIMEOUT_MS } from './constants.js';
import { loadNewYork511Sources } from './iteris511.js';
export const NEWYORK_PUBLIC_CAMERAS_URL = 'https://api-511x-nysdot.carsprogram.org/cameras/map-features';
const VIDEO_HOSTS = new Set(['s7.nysdot.skyvdn.com', 's9.nysdot.skyvdn.com', 's51.nysdot.skyvdn.com', 's52.nysdot.skyvdn.com', 's53.nysdot.skyvdn.com']);
export function newYorkPublicMedia(value, video = false) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return '';
    const valid = video
      ? VIDEO_HOSTS.has(u.hostname) && /^\/rtplive\/[A-Za-z0-9_-]+\/playlist\.m3u8$/.test(u.pathname)
      : (u.hostname === 'public.carsprogram.org' && /^\/cameras\/NYSDOT\/[A-Za-z0-9_.-]+$/.test(u.pathname)) ||
        (u.hostname === 'nyctmc.org' && /^\/api\/cameras\/[a-f0-9-]+\/image$/.test(u.pathname));
    return valid ? u.href : '';
  } catch { return ''; }
}
export function normalizeNewYorkPublic(body) {
  const rows = new Map();
  for (const feature of body?.features || []) {
    const p = feature?.properties;
    const coords = feature?.geometry?.coordinates;
    if (p?.public !== true || feature?.geometry?.type !== 'Point' || !Array.isArray(coords)) continue;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 40.45 || lat > 45.1 || lon < -79.9 || lon > -71.7 || !/^\d+$/.test(String(p.id))) continue;
    for (const [index, view] of (Array.isArray(p.views) ? p.views : []).entries()) {
      if (view.broken !== false) continue;
      const video = newYorkPublicMedia(view.url, true);
      const snapshot = newYorkPublicMedia(view.videoPreviewUrl) || newYorkPublicMedia(view.url);
      if (!video && !snapshot) continue;
      const id = `ny511-public-${p.id}-${index}`;
      rows.set(id, { id, name: String(view.name || p.name || 'New York public camera'), city: 'New York State', cityId: 'new-york-state',
        lat, lon, feedType: video ? 'hls' : 'image', url: video || snapshot, snapshotUrl: snapshot,
        provider: 'New York State Department of Transportation / 511NY', credit: String(p.cameraOwner || 'NYSDOT / 511NY'),
        sourceKind: 'new-york-511-public', frameRefreshMs: 60_000,
        license: 'Official public traveler-information feed; NYSDOT / 511NY provider terms apply. No independent redistribution license asserted.',
      });
    }
  }
  return [...rows.values()];
}
export async function loadNewYorkSources({ fetchImpl = fetch, env = process.env } = {}) {
  try {
    const response = await fetchImpl(NEWYORK_PUBLIC_CAMERAS_URL, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error('Public camera feed unavailable');
    const body = await readResponseJsonCapped(response, 8 * 1024 * 1024);
    if (!Array.isArray(body?.features)) throw new Error('Public camera feed format changed');
    return normalizeNewYorkPublic(body);
  } catch {
    // A configured legacy account can still serve installations where v2 remains valid.
    // Its loader returns [] for HTML/invalid data and never logs a key-bearing URL.
    return loadNewYork511Sources({ env, fetchImpl });
  }
}
