import { readResponseJsonCapped } from '../common/http.js';
import { CCTV_SOURCE_FETCH_TIMEOUT_MS } from './constants.js';

// Official 511 dashboard query: a featured subset, not the statewide camera inventory.
const QUERY = '{dashboardQuery{cameraViewsPayload{cameraViews{title uri url sources{type src} parentCollection{uri bbox}}}}}';
export const MINNESOTA_FEATURED_URL = `https://511mn.org/api/graphql?query=${encodeURIComponent(QUERY)}`;
export function verifiedMinnesotaImage(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin === 'https://public.carsprogram.org' && !url.username && !url.password && !url.hash &&
      /^\/cameras\/MN\/[A-Za-z0-9_-]+$/.test(url.pathname) && (!url.search || /^\?\d{10,16}$/.test(url.search)) ? url.href : '';
  } catch { return ''; }
}
export function normalizeMinnesotaFeatured(body) {
  const rows = body?.data?.dashboardQuery?.cameraViewsPayload?.cameraViews;
  const cameras = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const match = /^camera\/(\d+)\/(\d+)$/.exec(String(row?.uri || ''));
    const bbox = row?.parentCollection?.bbox;
    if (!match || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) continue;
    const [lon, lat, east, north] = bbox;
    if (lon !== east || lat !== north || lon < -97.3 || lon > -89.4 || lat < 43.4 || lat > 49.5) continue;
    const image = verifiedMinnesotaImage(row.url);
    if (!image) continue;
    const id = `mn-featured-${match[1]}-${match[2]}`;
    cameras.set(id, {
      id, name: String(row.title || 'Minnesota featured camera').trim(),
      city: 'Minnesota (featured cameras)', cityId: 'minnesota-featured', lat, lon,
      provider: 'Minnesota Department of Transportation / 511 Minnesota',
      credit: 'MnDOT / 511 Minnesota', sourceKind: 'minnesota-featured-public',
      license: 'Public traveler-information images; MnDOT / 511 provider terms apply. No independent redistribution license asserted.',
      feedType: 'image', url: image, snapshotUrl: image, frameRefreshMs: 60_000,
      mediaLimitation: 'Featured dashboard subset only, not statewide coverage. Snapshot; image freshness and availability depend on the provider.',
    });
  }
  return [...cameras.values()];
}
export async function loadMinnesotaFeaturedSources({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(MINNESOTA_FEATURED_URL, {
    headers: { Accept: 'application/json' }, redirect: 'error',
    signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Minnesota featured camera catalog HTTP ${response.status}`);
  const body = await readResponseJsonCapped(response, 2 * 1024 * 1024);
  if (body?.errors?.length) throw new Error('Minnesota featured camera query unavailable');
  return normalizeMinnesotaFeatured(body);
}
