import { readResponseJsonCapped } from '../common/http.js';
import { CCTV_SOURCE_FETCH_TIMEOUT_MS } from './constants.js';
import { directionToHeading } from '../../../src/data/directionText.js';

// Same public-only filter used by OKTraffic's unauthenticated camera map.
const PUBLIC_FILTER = { include: [{ relation: 'mapCameras', scope: {
  include: 'streamDictionary', where: { status: { neq: 'Out Of Service' }, type: 'Web', blockAtis: { neq: '1' } },
} }, { relation: 'cameraLocationLinks', scope: { include: ['linkedCameraPole', 'cameraPole'] } }] };
export const OKTRAFFIC_CAMERAS_URL = `https://oktraffic.org/api/CameraPoles?filter=${encodeURIComponent(JSON.stringify(PUBLIC_FILTER))}`;
export function verifiedOklahomaHlsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin === 'https://stream.oktraffic.org' && !url.username && !url.password &&
      !url.search && !url.hash && /^\/delay-stream\/[a-f0-9]{16}\.stream\/playlist\.m3u8$/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
export function normalizeOklahomaSources(poles) {
  const cameras = new Map();
  for (const pole of Array.isArray(poles) ? poles : []) {
    for (const row of Array.isArray(pole?.mapCameras) ? pole.mapCameras : []) {
      if (row?.type !== 'Web' || row?.status === 'Out Of Service' || String(row?.blockAtis) === '1') continue;
      const rawId = String(row?.id ?? '');
      if (!/^\d+$/.test(rawId)) continue;
      const lat = Number(row.latitude), lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 33.6 || lat > 37.1 || lon < -103.1 || lon > -94.3) continue;
      const url = verifiedOklahomaHlsUrl(row.streamDictionary?.streamSrc);
      if (!url) continue;
      const city = String(row.city || 'Oklahoma').trim();
      const direction = String(row.direction || '').trim().toUpperCase();
      const heading = ({ N: 0, E: 90, S: 180, W: 270 })[direction] ?? directionToHeading(direction, true);
      const id = `oktraffic-${rawId}`;
      cameras.set(id, {
        id, name: String(row.location || pole.name || `Oklahoma camera ${rawId}`).trim(),
        city, cityId: city.toLowerCase().replace(/[^a-z0-9]+/g, '-'), lat, lon,
        provider: 'Oklahoma Department of Transportation / OKTraffic',
        credit: 'Oklahoma Department of Transportation / Oklahoma Turnpike Authority',
        sourceKind: 'oktraffic-public-camera',
        license: 'Public traveler-information feed; OKTraffic and provider terms apply. No independent redistribution license asserted.',
        ...(Number.isFinite(heading) ? { headingDeg: heading, headingConfidence: 'high' } : {}),
        feedType: 'hls', url, snapshotUrl: '',
        mediaLimitation: 'Official delayed HLS traffic stream; no separate public snapshot advertised. Availability can change.',
      });
    }
  }
  // Preserve every verified row; global allocation must not silently become statewide coverage.
  return [...cameras.values()];
}
export async function loadOklahomaSources({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(OKTRAFFIC_CAMERAS_URL, {
    headers: { Accept: 'application/json' }, redirect: 'error',
    signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OKTraffic camera catalog HTTP ${response.status}`);
  return normalizeOklahomaSources(await readResponseJsonCapped(response, 8 * 1024 * 1024));
}
