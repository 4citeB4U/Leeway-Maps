import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { normalizeFirePerimeterSnapshot } from './records.js';

const WFIGS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
  'WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';
const MAX_PAGES = 5;
const PAGE_BYTES = 16 * 1024 * 1024;
const OUT_FIELDS = [
  'poly_IncidentName',
  'attr_UniqueFireIdentifier',
  'attr_IncidentSize',
  'attr_PercentContained',
  'attr_POOState',
  'attr_IncidentTypeCategory',
  'attr_FireDiscoveryDateTime',
  'poly_DateCurrent',
  'attr_FireCause',
  'attr_FireBehaviorGeneral',
  'attr_TotalIncidentPersonnel',
  'attr_POOCounty',
  'attr_EstimatedCostToDate',
  'attr_IncidentComplexityLevel',
  'attr_CpxName',
];

async function publicSnapshot(fetchImpl, signal) {
  const features = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    signal.throwIfAborted();
    const params = new URLSearchParams({
      where: '1=1',
      outFields: OUT_FIELDS.join(','),
      maxAllowableOffset: '0.001',
      outSR: '4326',
      f: 'geojson',
      orderByFields: 'OBJECTID ASC',
      resultRecordCount: '2000',
      resultOffset: String(features.length),
    });
    const response = await fetchImpl(`${WFIGS_URL}?${params}`, {
      signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`WFIGS HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(response, PAGE_BYTES, signal);
    if (!Array.isArray(payload?.features))
      throw new Error('Malformed perimeter snapshot');
    features.push(...payload.features);
    const more =
      payload.exceededTransferLimit === true ||
      payload.properties?.exceededTransferLimit === true;
    if (!more) return normalizeFirePerimeterSnapshot({ features });
    if (!payload.features.length) break;
  }
  // A truncated acquisition must not replace the previous complete snapshot or
  // acquire a fresh timestamp in the layer. Its existing error surface explains why.
  throw new Error('Incomplete WFIGS perimeter feed; full snapshot unavailable');
}

/** Keyless public WFIGS for Pages; retain the normalized proxy elsewhere. */
export function createWfigsPerimeterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  publicWfigs = import.meta.env?.VITE_LEEWAY_STATIC_PAGES === '1' ||
    globalThis.location?.hostname?.endsWith('github.io') === true,
  timeoutMs = 30_000,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      if (publicWfigs) {
        const controller = new AbortController();
        const abort = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(
          () =>
            controller.abort(new Error('WFIGS perimeter request timed out')),
          timeoutMs,
        );
        try {
          return await publicSnapshot(fetchImpl, controller.signal);
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        }
      }
      const response = await fetchImpl('/api/fire-perimeters', { signal });
      if (!response.ok) throw new Error(`WFIGS HTTP ${response.status}`);
      const payload = await readResponseJsonCapped(
        response,
        80 * 1024 * 1024,
        signal,
      );
      signal?.throwIfAborted();
      if (!Array.isArray(payload?.rows))
        throw new Error('Malformed perimeter snapshot');
      return payload.rows;
    },
  };
}
