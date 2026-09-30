import {
  WEATHER_WMS_BASE,
  WEATHER_WMS_PRODUCTS,
  parseWeatherCapabilities,
} from './protocol.js';
import { readResponseTextCapped } from '../../sources/httpBody.js';

export function usePublicWeather() {
  return (
    import.meta.env?.VITE_LEEWAY_STATIC_PAGES === '1' ||
    globalThis.location?.hostname?.endsWith('github.io') === true
  );
}

// Metadata is bounded by the four fixed products, never supplied by a remote host.
const boundsByProduct = new Map();

export async function readPublicWeather(product, fetchImpl, signal) {
  const spec = WEATHER_WMS_PRODUCTS[product];
  if (!spec) throw new Error('Unknown weather product');
  const url = `${WEATHER_WMS_BASE}${spec.service}/ows?service=WMS&version=1.3.0&request=GetCapabilities`;
  const response = await fetchImpl(url, {
    signal,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`NOAA weather HTTP ${response.status}`);
  const xml = await readResponseTextCapped(response, 512 * 1024, signal);
  const { bounds, times } = parseWeatherCapabilities(xml, product);
  boundsByProduct.set(product, bounds);
  return {
    schemaVersion: 1,
    product,
    bounds,
    times,
    latest: times.at(-1),
    title: spec.title,
    coverage: spec.coverage,
    description: spec.description,
    source: 'NOAA nowCOAST direct WMS',
    attribution: spec.attribution ?? 'NOAA/NWS/NESDIS nowCOAST',
    fetchedAt: new Date().toISOString(),
    stale: false,
    unavailable: false,
    tileSize: 256,
    maxLevel: 6,
    tilingScheme: 'geographic',
  };
}

export function publicWeatherUrl(
  product,
  time,
  { width = 256, height = 256, bbox = null, tile = false } = {},
) {
  const spec = WEATHER_WMS_PRODUCTS[product];
  if (!spec || !Number.isFinite(Date.parse(time)))
    throw new Error('Invalid weather frame');
  const bounds = bbox ?? boundsByProduct.get(product);
  if (!tile && !bounds)
    throw new Error('Load NOAA observation metadata before imagery');
  const box = tile
    ? '{westDegrees},{southDegrees},{eastDegrees},{northDegrees}'
    : [bounds.west, bounds.south, bounds.east, bounds.north].join(',');
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: spec.layer,
    styles: spec.style,
    srs: 'EPSG:4326',
    width: String(width),
    height: String(height),
    format: 'image/png',
    transparent: 'true',
    time,
  });
  // Keep Cesium's rectangle placeholders unescaped.
  return `${WEATHER_WMS_BASE}${spec.service}/ows?${params}&bbox=${box}`;
}
