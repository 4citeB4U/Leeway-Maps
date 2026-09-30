/*
REGION: LeeWay Logistics / CCTV
TAG: LEEWAY.LOGISTICS.CCTV.KEYED_511
5WH:
WHAT = Normalizes keyed 511 camera APIs that expose Id/Views records.
WHY = Adds governed statewide CCTV packs without duplicating provider logic.
WHO = LeeWay Industries under Creator authority.
WHERE = server/providers/cctv/iteris511.js
WHEN = Catalog refresh for enabled keyed 511 providers.
HOW = Server-side key injection, official-origin frame synthesis, bounded caps.
LICENSE = MIT, matching this repository.
*/
import {
  GEORGIA_511_CAMERAS_URL,
  GEORGIA_511_IMAGE_ORIGIN,
  DEFAULT_GEORGIA_511_MAX_SOURCES,
  GEORGIA_511_ANCHORS,
  NEWYORK_511_CAMERAS_URL,
  NEWYORK_511_IMAGE_ORIGIN,
  DEFAULT_NEWYORK_511_MAX_SOURCES,
  NEWYORK_511_ANCHORS,
  CCTV_SOURCE_FETCH_TIMEOUT_MS,
} from './constants.js';
import {
  fallbackHeadingFromId,
  isPlausibleLatLon,
  prioritizeSources,
  toFiniteNumber,
} from './normalize.js';
import { directionToHeading } from '../../../src/data/directionText.js';
import { readResponseJsonCapped } from '../common/http.js';
function firstKey(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function enabledView(views) {
  return (Array.isArray(views) ? views : []).find(
    (view) =>
      String(view?.Status || view?.status || '')
        .trim()
        .toLowerCase() === 'enabled' &&
      String(view?.Id ?? view?.id ?? '').trim(),
  );
}

function officialFrameUrl(imageOrigin, view) {
  const raw = String(view?.Id ?? view?.id ?? '').trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(raw)) return '';
  return imageOrigin + encodeURIComponent(raw);
}

function boundedMax(env, name, fallback) {
  const raw = Number(env?.[name] ?? fallback);
  return Number.isFinite(raw)
    ? Math.max(8, Math.min(1500, Math.floor(raw)))
    : fallback;
}
export function keyed511CatalogUrl(endpoint, key) {
  const value = String(key || '').trim();
  if (!value) return '';
  const url = new URL(endpoint);
  url.searchParams.set('key', value);
  url.searchParams.set('format', 'json');
  return url.href;
}

async function loadKeyed511Pack({
  env,
  fetchImpl,
  keyNames,
  endpoint,
  imageOrigin,
  prefix,
  provider,
  stateLabel,
  cityId,
  bounds,
  sourceKind,
  license,
  maxEnv,
  maxDefault,
  anchors,
}) {
  const key = firstKey(env, keyNames);
  if (!key) {
    console.warn(
      `[CCTV] ${provider} unavailable: developer key not configured`,
    );
    return [];
  }
  try {
    const response = await fetchImpl(keyed511CatalogUrl(endpoint, key), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(
        `[CCTV] ${provider} camera download failed:`,
        response.status,
      );
      return [];
    }
    const rows = await readResponseJsonCapped(response, 8 * 1024 * 1024);
    if (!Array.isArray(rows)) return [];
    const cameras = [];
    for (const row of rows) {
      const lat = toFiniteNumber(row?.Latitude ?? row?.latitude);
      const lon = toFiniteNumber(row?.Longitude ?? row?.longitude);
      if (!isPlausibleLatLon(lat, lon)) continue;
      if (
        lat < bounds.south ||
        lat > bounds.north ||
        lon < bounds.west ||
        lon > bounds.east
      )
        continue;
      const view = enabledView(row?.Views ?? row?.views);
      if (!view) continue;
      const snapshotUrl = officialFrameUrl(imageOrigin, view);
      if (!snapshotUrl) continue;
      const stable = String(
        view.Id ?? view.id ?? row.Id ?? row.id ?? '',
      ).trim();
      const cameraId =
        prefix + stable.replace(/[^A-Za-z0-9_.-]+/g, '-').toLowerCase();
      const direction = String(row?.Direction ?? row?.direction ?? '').trim();
      const heading = directionToHeading(direction, true);
      const hasHeading = Number.isFinite(heading);
      const location = String(row?.Location ?? row?.location ?? '').trim();
      const roadway = String(row?.Roadway ?? row?.roadway ?? '').trim();
      cameras.push({
        id: cameraId,
        name: location || roadway || `${provider} Camera ${stable}`,
        city: stateLabel,
        cityId,
        provider,
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        pitchDeg: hasHeading ? -22 : -18,
        fovDeg: hasHeading ? 55 : 44,
        rangeM: hasHeading ? 200 : 145,
        mountHeightM: 9,
        groundElevationM: 100,
        feedType: 'image',
        url: snapshotUrl,
        snapshotUrl,
        sourceKind,
        license,
        credit: provider,
        code: String(row?.Roadway ?? row?.SourceId ?? stable).trim(),
        frameRefreshMs: 15 * 1000,
      });
    }
    const unique = Array.from(
      new Map(cameras.map((camera) => [camera.id, camera])).values(),
    );
    const prioritized = prioritizeSources(
      unique,
      boundedMax(env, maxEnv, maxDefault),
      anchors,
    );
    console.log(
      `[CCTV] Loaded ${provider} sources: ${unique.length} cameras (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch {
    // Fetch/URL errors may include the developer key in their message.
    console.warn(`[CCTV] ${provider} camera download failed`);
    return [];
  }
}

export function loadNewYork511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['NEWYORK_511_API_KEY', 'CCTV_NEWYORK_511_KEY'],
    endpoint: NEWYORK_511_CAMERAS_URL,
    imageOrigin: NEWYORK_511_IMAGE_ORIGIN,
    prefix: 'ny511-',
    provider: 'New York State Department of Transportation / 511NY',
    stateLabel: 'New York State',
    cityId: 'new-york-state',
    bounds: { south: 40.4, north: 45.1, west: -79.9, east: -71.7 },
    sourceKind: 'new-york-511-official',
    license: '511NY developer API and data-feed terms apply',
    maxEnv: 'CCTV_NEWYORK_511_MAX_SOURCES',
    maxDefault: DEFAULT_NEWYORK_511_MAX_SOURCES,
    anchors: NEWYORK_511_ANCHORS,
  });
}

export function loadGeorgia511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['GEORGIA_511_API_KEY', 'CCTV_GEORGIA_511_KEY'],
    endpoint: GEORGIA_511_CAMERAS_URL,
    imageOrigin: GEORGIA_511_IMAGE_ORIGIN,
    prefix: 'ga511-',
    provider: 'Georgia Department of Transportation / 511GA',
    stateLabel: 'Georgia',
    cityId: 'georgia',
    bounds: { south: 30.3, north: 35.1, west: -85.7, east: -80.6 },
    sourceKind: 'georgia-511-official',
    license: '511GA developer API terms apply',
    maxEnv: 'CCTV_GEORGIA_511_MAX_SOURCES',
    maxDefault: DEFAULT_GEORGIA_511_MAX_SOURCES,
    anchors: GEORGIA_511_ANCHORS,
  });
}
