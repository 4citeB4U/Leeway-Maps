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
  ALASKA_511_CAMERAS_URL,
  ALASKA_511_IMAGE_ORIGIN,
  DEFAULT_ALASKA_511_MAX_SOURCES,
  ALASKA_511_ANCHORS,
  ARIZONA_511_CAMERAS_URL,
  ARIZONA_511_IMAGE_ORIGIN,
  DEFAULT_ARIZONA_511_MAX_SOURCES,
  ARIZONA_511_ANCHORS,
  IDAHO_511_CAMERAS_URL,
  IDAHO_511_IMAGE_ORIGIN,
  DEFAULT_IDAHO_511_MAX_SOURCES,
  IDAHO_511_ANCHORS,
  LOUISIANA_511_CAMERAS_URL,
  LOUISIANA_511_IMAGE_ORIGIN,
  DEFAULT_LOUISIANA_511_MAX_SOURCES,
  LOUISIANA_511_ANCHORS,
  CONNECTICUT_511_CAMERAS_URL,
  CONNECTICUT_511_IMAGE_ORIGIN,
  DEFAULT_CONNECTICUT_511_MAX_SOURCES,
  CONNECTICUT_511_ANCHORS,
  FLORIDA_511_CAMERAS_URL,
  FLORIDA_511_IMAGE_ORIGIN,
  DEFAULT_FLORIDA_511_MAX_SOURCES,
  FLORIDA_511_ANCHORS,
  NEVADA_511_CAMERAS_URL,
  NEVADA_511_IMAGE_ORIGIN,
  DEFAULT_NEVADA_511_MAX_SOURCES,
  NEVADA_511_ANCHORS,
  NORTH_CAROLINA_511_CAMERAS_URL,
  NORTH_CAROLINA_511_IMAGE_ORIGIN,
  DEFAULT_NORTH_CAROLINA_511_MAX_SOURCES,
  NORTH_CAROLINA_511_ANCHORS,
  PENNSYLVANIA_511_CAMERAS_URL,
  PENNSYLVANIA_511_IMAGE_ORIGIN,
  DEFAULT_PENNSYLVANIA_511_MAX_SOURCES,
  PENNSYLVANIA_511_ANCHORS,
  UTAH_511_CAMERAS_URL,
  UTAH_511_IMAGE_ORIGIN,
  DEFAULT_UTAH_511_MAX_SOURCES,
  UTAH_511_ANCHORS,
  NEW_ENGLAND_511_CAMERAS_URL,
  NEW_ENGLAND_511_IMAGE_ORIGIN,
  DEFAULT_NEW_ENGLAND_511_MAX_SOURCES,
  NEW_ENGLAND_511_ANCHORS,
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

export function loadAlaska511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['ALASKA_511_API_KEY', 'CCTV_ALASKA_511_KEY'],
    endpoint: ALASKA_511_CAMERAS_URL,
    imageOrigin: ALASKA_511_IMAGE_ORIGIN,
    prefix: 'ak511-',
    provider: 'Alaska Department of Transportation & Public Facilities / Alaska 511',
    stateLabel: 'Alaska',
    cityId: 'alaska',
    bounds: { south: 51, north: 72, west: -180, east: 180 },
    sourceKind: 'alaska-511-official',
    license: 'Alaska 511 developer API and data-feed terms apply',
    maxEnv: 'CCTV_ALASKA_511_MAX_SOURCES',
    maxDefault: DEFAULT_ALASKA_511_MAX_SOURCES,
    anchors: ALASKA_511_ANCHORS,
  });
}

export function loadArizona511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['ARIZONA_511_API_KEY', 'CCTV_ARIZONA_511_KEY'],
    endpoint: ARIZONA_511_CAMERAS_URL,
    imageOrigin: ARIZONA_511_IMAGE_ORIGIN,
    prefix: 'az511-',
    provider: 'Arizona Department of Transportation / AZ 511',
    stateLabel: 'Arizona',
    cityId: 'arizona',
    bounds: { south: 31.2, north: 37.1, west: -114.9, east: -109.0 },
    sourceKind: 'arizona-511-official',
    license: 'AZ 511 developer API and data-feed terms apply',
    maxEnv: 'CCTV_ARIZONA_511_MAX_SOURCES',
    maxDefault: DEFAULT_ARIZONA_511_MAX_SOURCES,
    anchors: ARIZONA_511_ANCHORS,
  });
}

export function loadIdaho511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['IDAHO_511_API_KEY', 'CCTV_IDAHO_511_KEY'],
    endpoint: IDAHO_511_CAMERAS_URL,
    imageOrigin: IDAHO_511_IMAGE_ORIGIN,
    prefix: 'id511-',
    provider: 'Idaho Transportation Department / Idaho 511',
    stateLabel: 'Idaho',
    cityId: 'idaho',
    bounds: { south: 41.9, north: 49.1, west: -117.3, east: -111.0 },
    sourceKind: 'idaho-511-official',
    license: 'Idaho 511 developer API and data-feed terms apply',
    maxEnv: 'CCTV_IDAHO_511_MAX_SOURCES',
    maxDefault: DEFAULT_IDAHO_511_MAX_SOURCES,
    anchors: IDAHO_511_ANCHORS,
  });
}

export function loadLouisiana511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['LOUISIANA_511_API_KEY', 'CCTV_LOUISIANA_511_KEY'],
    endpoint: LOUISIANA_511_CAMERAS_URL,
    imageOrigin: LOUISIANA_511_IMAGE_ORIGIN,
    prefix: 'la511-',
    provider: 'Louisiana Department of Transportation and Development / 511LA',
    stateLabel: 'Louisiana',
    cityId: 'louisiana',
    bounds: { south: 28.8, north: 33.1, west: -94.1, east: -88.8 },
    sourceKind: 'louisiana-511-official',
    license: '511LA developer API and data-feed terms apply',
    maxEnv: 'CCTV_LOUISIANA_511_MAX_SOURCES',
    maxDefault: DEFAULT_LOUISIANA_511_MAX_SOURCES,
    anchors: LOUISIANA_511_ANCHORS,
  });
}

export function loadConnecticut511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['CONNECTICUT_511_API_KEY', 'CTROADS_API_KEY'],
    endpoint: CONNECTICUT_511_CAMERAS_URL,
    imageOrigin: CONNECTICUT_511_IMAGE_ORIGIN,
    prefix: 'ct511-',
    provider: 'Connecticut Department of Transportation / CTroads',
    stateLabel: 'Connecticut',
    cityId: 'connecticut',
    bounds: { south: 40.9, north: 42.1, west: -73.8, east: -71.7 },
    sourceKind: 'connecticut-511-official',
    license: 'CTroads developer API and data-feed terms apply',
    maxEnv: 'CCTV_CONNECTICUT_511_MAX_SOURCES',
    maxDefault: DEFAULT_CONNECTICUT_511_MAX_SOURCES,
    anchors: CONNECTICUT_511_ANCHORS,
  });
}

export function loadFlorida511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['FLORIDA_511_API_KEY', 'FL511_API_KEY'],
    endpoint: FLORIDA_511_CAMERAS_URL,
    imageOrigin: FLORIDA_511_IMAGE_ORIGIN,
    prefix: 'fl511-',
    provider: 'Florida Department of Transportation / FL511',
    stateLabel: 'Florida',
    cityId: 'florida',
    bounds: { south: 24.3, north: 31.1, west: -87.8, east: -79.8 },
    sourceKind: 'florida-511-official',
    license: 'FL511 traveler-information and developer-feed terms apply',
    maxEnv: 'CCTV_FLORIDA_511_MAX_SOURCES',
    maxDefault: DEFAULT_FLORIDA_511_MAX_SOURCES,
    anchors: FLORIDA_511_ANCHORS,
  });
}

export function loadNevada511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['NEVADA_511_API_KEY', 'NVROADS_API_KEY'],
    endpoint: NEVADA_511_CAMERAS_URL,
    imageOrigin: NEVADA_511_IMAGE_ORIGIN,
    prefix: 'nv511-',
    provider: 'Nevada Department of Transportation / Nevada 511',
    stateLabel: 'Nevada',
    cityId: 'nevada',
    bounds: { south: 35.0, north: 42.1, west: -120.1, east: -114.0 },
    sourceKind: 'nevada-511-official',
    license: 'Nevada 511 developer API and data-feed terms apply',
    maxEnv: 'CCTV_NEVADA_511_MAX_SOURCES',
    maxDefault: DEFAULT_NEVADA_511_MAX_SOURCES,
    anchors: NEVADA_511_ANCHORS,
  });
}

export function loadNorthCarolina511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['NORTH_CAROLINA_511_API_KEY', 'DRIVENC_API_KEY'],
    endpoint: NORTH_CAROLINA_511_CAMERAS_URL,
    imageOrigin: NORTH_CAROLINA_511_IMAGE_ORIGIN,
    prefix: 'nc511-',
    provider: 'North Carolina Department of Transportation / DriveNC',
    stateLabel: 'North Carolina',
    cityId: 'north-carolina',
    bounds: { south: 33.7, north: 36.7, west: -84.4, east: -75.3 },
    sourceKind: 'north-carolina-511-official',
    license: 'DriveNC developer API and data-feed terms apply',
    maxEnv: 'CCTV_NORTH_CAROLINA_511_MAX_SOURCES',
    maxDefault: DEFAULT_NORTH_CAROLINA_511_MAX_SOURCES,
    anchors: NORTH_CAROLINA_511_ANCHORS,
  });
}

export function loadPennsylvania511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['PENNSYLVANIA_511_API_KEY', 'PA511_API_KEY'],
    endpoint: PENNSYLVANIA_511_CAMERAS_URL,
    imageOrigin: PENNSYLVANIA_511_IMAGE_ORIGIN,
    prefix: 'pa511-',
    provider: 'Pennsylvania Department of Transportation / 511PA',
    stateLabel: 'Pennsylvania',
    cityId: 'pennsylvania',
    bounds: { south: 39.6, north: 42.3, west: -80.6, east: -74.5 },
    sourceKind: 'pennsylvania-511-official',
    license: '511PA traveler-information and data-feed terms apply',
    maxEnv: 'CCTV_PENNSYLVANIA_511_MAX_SOURCES',
    maxDefault: DEFAULT_PENNSYLVANIA_511_MAX_SOURCES,
    anchors: PENNSYLVANIA_511_ANCHORS,
  });
}

export function loadUtah511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['UTAH_511_API_KEY', 'UDOT_TRAFFIC_API_KEY'],
    endpoint: UTAH_511_CAMERAS_URL,
    imageOrigin: UTAH_511_IMAGE_ORIGIN,
    prefix: 'ut511-',
    provider: 'Utah Department of Transportation / UDOT Traffic',
    stateLabel: 'Utah',
    cityId: 'utah',
    bounds: { south: 36.9, north: 42.1, west: -114.1, east: -109.0 },
    sourceKind: 'utah-511-official',
    license: 'UDOT Traffic developer API and data-feed terms apply',
    maxEnv: 'CCTV_UTAH_511_MAX_SOURCES',
    maxDefault: DEFAULT_UTAH_511_MAX_SOURCES,
    anchors: UTAH_511_ANCHORS,
  });
}

export function loadNewEngland511Sources({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  return loadKeyed511Pack({
    env,
    fetchImpl,
    keyNames: ['NEW_ENGLAND_511_API_KEY', 'NEWENGLAND_511_API_KEY'],
    endpoint: NEW_ENGLAND_511_CAMERAS_URL,
    imageOrigin: NEW_ENGLAND_511_IMAGE_ORIGIN,
    prefix: 'ne511-',
    provider: 'New England 511',
    stateLabel: 'Maine / New Hampshire / Vermont',
    cityId: 'new-england',
    bounds: { south: 42.7, north: 47.6, west: -73.5, east: -66.8 },
    sourceKind: 'new-england-511-official',
    license: 'New England 511 traveler-information and data-feed terms apply',
    maxEnv: 'CCTV_NEW_ENGLAND_511_MAX_SOURCES',
    maxDefault: DEFAULT_NEW_ENGLAND_511_MAX_SOURCES,
    anchors: NEW_ENGLAND_511_ANCHORS,
  });
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
