import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherSource, weatherTileUrl, weatherImageUrl } from './source.js';
import { publicWeatherUrl } from './publicWms.js';

const time = new Date(Date.now() - 60_000).toISOString();
const xml = `<WMS_Capabilities><Layer><Name>conus_base_reflectivity_mosaic</Name>
<EX_GeographicBoundingBox><westBoundLongitude>-130</westBoundLongitude><eastBoundLongitude>-60</eastBoundLongitude><southBoundLatitude>20</southBoundLatitude><northBoundLatitude>55</northBoundLatitude></EX_GeographicBoundingBox>
<Dimension name="time" units="ISO8601" default="${time}">${time}</Dimension></Layer></WMS_Capabilities>`;

test('static weather fetches real NOAA capabilities and uses only their observed time and extent', async () => {
  const requests = [];
  const source = createWeatherSource({ publicWms: true, fetchImpl: async (url) => {
    requests.push(url);
    return new Response(xml);
  } });
  const snapshot = await source.getSnapshot();
  assert.equal(snapshot.latest, time);
  assert.match(requests[0], /^https:\/\/nowcoast.noaa.gov\/geoserver\/observations\/weather_radar\/ows\?/);
  assert.equal(snapshot.source, 'NOAA nowCOAST direct WMS');
  const image = new URL(publicWeatherUrl('radar', time, { width: 1024, height: 512 }));
  assert.equal(image.searchParams.get('bbox'), '-130,20,-60,55');
  assert.equal(image.searchParams.get('time'), time);
  assert.equal(image.searchParams.get('srs'), 'EPSG:4326');
});

test('GitHub Pages uses direct imagery, including geographic tile rectangles and detail windows', () => {
  const previous = globalThis.location;
  globalThis.location = { hostname: '4citeB4U.github.io' };
  try {
    const tile = weatherTileUrl('lightning', time);
    assert.match(tile, /nowcoast.noaa.gov/);
    assert.match(tile, /bbox=\{westDegrees\},\{southDegrees\},\{eastDegrees\},\{northDegrees\}$/);
    const image = new URL(weatherImageUrl('clouds', time, { width: 1024, height: 512 }, { west: -120, south: 20, east: -100, north: 30 }));
    assert.equal(image.searchParams.get('bbox'), '-120,20,-100,30');
    assert.equal(image.searchParams.get('layers'), 'global_longwave_imagery_mosaic');
  } finally { globalThis.location = previous; }
});

test('static weather rejects unavailable, oversized, expired and fabricated metadata', async () => {
  for (const response of [
    () => new Response('Offline', { status: 503 }),
    () => new Response(' '.repeat(512 * 1024 + 1)),
    () => new Response(xml.replaceAll(time, '2000-01-01T00:00:00.000Z')),
    () => new Response(xml.replace(time + '</Dimension>', time + '/PT5M</Dimension>')),
  ]) {
    const source = createWeatherSource({ publicWms: true, fetchImpl: async () => response() });
    await assert.rejects(source.getSnapshot());
  }
  const source = createWeatherSource({ publicWms: true, fetchImpl: async () => { throw new Error('Must not fetch'); } });
  await assert.rejects(source.getSnapshot({ signal: AbortSignal.abort() }), { name: 'AbortError' });
});
