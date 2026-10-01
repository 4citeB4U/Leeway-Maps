/** Official public Iowa/Missouri camera inventories. No keys or inferred media URLs. */
import { createHash } from 'node:crypto';
import { readResponseJsonCapped } from '../common/http.js';
import { fallbackHeadingFromId } from './normalize.js';

export const IOWA_CAMERA_LAYER = 'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0';
export const MISSOURI_CAMERA_LAYER = 'https://mapping.modot.org/arcgis/rest/services/TravelerInformation/NWSDATA/MapServer/0';
export const MIDWEST_CAMERA_MEDIA_HOSTS = Object.freeze(['atmsqf.iowadot.gov', 'sfs01-traveler.modot.mo.gov', 'sfs02-traveler.modot.mo.gov', 'sfs03-traveler.modot.mo.gov', 'sfs04-traveler.modot.mo.gov', 'sfs07-traveler.modot.mo.gov']);
const MAX_ROWS = 5000;

function mediaUrl(raw, state) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search) return '';
    if (state === 'iowa') return url.hostname === MIDWEST_CAMERA_MEDIA_HOSTS[0] && /^\/snapshots\/public\/.+\.jpe?g$/i.test(url.pathname) ? url.href : '';
    return MIDWEST_CAMERA_MEDIA_HOSTS.slice(1).includes(url.hostname) && /^\/rtplive\/[A-Za-z0-9_-]+\/playlist\.m3u8$/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

function inState(lat, lon, state) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return state === 'iowa' ? lat >= 40.3 && lat <= 43.6 && lon >= -96.7 && lon <= -90.0 : lat >= 35.9 && lat <= 40.7 && lon >= -95.9 && lon <= -88.9;
}

export function normalizeMidwestCameras(payload, state) {
  if (!['iowa', 'missouri'].includes(state)) throw new Error('Unknown Midwest camera source');
  const rows = [];
  for (const feature of (payload?.features || []).slice(0, MAX_ROWS)) {
    const a = feature?.attributes || {};
    // Some official inventory coordinates are bad. Never map (0,0) or out-of-state records.
    const lat = Number(feature.geometry?.y ?? (state === 'iowa' ? a.latitude : a.Y));
    const lon = Number(feature.geometry?.x ?? (state === 'iowa' ? a.longitude : a.X));
    if (!inState(lat, lon, state)) continue;
    if (state === 'missouri' && a.STREAM_ERROR !== 'N') continue;
    const url = mediaUrl(state === 'iowa' ? a.ImageURL : a.URL2, state);
    if (!url) continue;
    // Iowa device_id repeats for different views and daily FID is not a stable camera identity.
    const upstreamId = state === 'iowa' ? String(a.device_id ?? '') : String(a.CAM_ID ?? '');
    if (!/^\d+$/.test(upstreamId)) continue;
    const id = state === 'iowa' ? `ia-dot-${upstreamId}-${createHash('sha256').update(url).digest('hex').slice(0, 12)}` : `mo-dot-${upstreamId}`;
    const provider = state === 'iowa' ? 'Iowa Department of Transportation' : 'Missouri Department of Transportation';
    rows.push({ id, name: String(state === 'iowa' ? a.ImageName || a.Desc_ || `Iowa camera ${upstreamId}` : a.DESCRIPTION || `Missouri camera ${upstreamId}`),
      city: state === 'iowa' ? 'Iowa' : 'Missouri', cityId: state === 'iowa' ? 'iowa-statewide' : 'missouri-statewide', provider,
      lat, lon, headingDeg: fallbackHeadingFromId(id), headingConfidence: 'low', pitchDeg: -18, fovDeg: 44, rangeM: 145, mountHeightM: 9,
      feedType: state === 'iowa' ? 'image' : 'hls', url, snapshotUrl: state === 'iowa' ? url : '', sourceKind: `${state}-dot-open-data`,
      license: state === 'iowa' ? 'Inventory: CC BY 4.0; Iowa DOT GIS and 511 feed terms apply' : 'MoDOT public traveler-information camera feed; no warranty of availability',
      credit: provider, code: upstreamId, frameRefreshMs: 60000,
      // Inventory dates are not frame capture times. Snapshot freshness is determined by media response.
      ageMinutes: null, warningAge: false,
    });
  }
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

async function load(layer, state, { fetchImpl = globalThis.fetch, signal } = {}) {
  const timeout = AbortSignal.timeout(12000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const features = [];
  for (let offset = 0; offset < MAX_ROWS; offset += 1000) {
    const query = new URL(`${layer}/query`);
    query.search = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'json', resultOffset: String(offset), resultRecordCount: '1000', orderByFields: state === 'iowa' ? 'FID ASC' : 'CAM_ID ASC' }).toString();
    const response = await fetchImpl(query.href, { signal: requestSignal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${state} camera inventory HTTP ${response.status}`);
    const data = await readResponseJsonCapped(response, 4 * 1024 * 1024, requestSignal);
    if (data.error || !Array.isArray(data.features)) throw new Error(`${state} camera inventory unavailable`);
    features.push(...data.features);
    if (features.length > MAX_ROWS) throw new Error(`${state} camera inventory exceeds safety cap`);
    if (!data.exceededTransferLimit) return normalizeMidwestCameras({ features }, state);
    if (!data.features.length) throw new Error(`${state} camera inventory pagination stalled`);
  }
  throw new Error(`${state} camera inventory exceeds safety cap`);
}
export const loadIowaSourcesFromOpenData = options => load(IOWA_CAMERA_LAYER, 'iowa', options);
export const loadMissouriSourcesFromOpenData = options => load(MISSOURI_CAMERA_LAYER, 'missouri', options);
