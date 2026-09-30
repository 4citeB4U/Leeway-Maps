import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTransitNetworkService,
  transitNetworkRequest,
  normalizeNetworkVehicles,
} from './transitNetworkService.js';
import {
  transitGeometryLines,
  transitDepartureText,
  escapeTransitText,
} from '../data/transitNetwork.js';
import { transitOsmQuery, normalizeTransitOsm } from '../data/transitOsm.js';
const request = (suffix) => ({
  method: 'GET',
  url: `http://localhost/api/transit/network/${suffix}`,
});

test('invalid geography and stop identifiers never reach an upstream', async () => {
  let calls = 0;
  const service = createTransitNetworkService({
    apiKey: 'test',
    fetchImpl: () => {
      calls++;
      throw new Error();
    },
  });
  for (const suffix of [
    'routes?lat=NaN&lon=0',
    'stops?lat=91&lon=1',
    'routes?lon=0',
    'departures?stop=https://example.org',
    'feeds?search=',
  ]) {
    assert.equal((await service.handle(request(suffix))).status, 400);
  }
  assert.equal(calls, 0);
  service.close();
});
test('no-key network uses OSM while departures remain honestly unavailable', async () => {
  let seen;
  const service = createTransitNetworkService({
    apiKey: '',
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return Response.json({
        elements: [
          {
            type: 'node',
            id: 1,
            lon: -87.6,
            lat: 41.8,
            tags: { name: 'Main St' },
          },
        ],
      });
    },
  });
  const response = await service.handle(request('stops?lat=41.8&lon=-87.6'));
  const body = await response.json();
  assert.equal(body.mappedOnly, true);
  assert.equal(body.stops.length, 1);
  assert.equal(
    seen.url.origin + seen.url.pathname,
    'https://overpass-api.de/api/interpreter',
  );
  assert.match(seen.url.searchParams.get('data'), /around:3000/);
  assert.equal(
    (await service.handle(request('departures?stop=s-test'))).status,
    503,
  );
  service.close();
});
test('provider credential remains in header, caching works, redirects are rejected', async () => {
  let calls = 0;
  const service = createTransitNetworkService({
    apiKey: 'secret',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(options.headers.apikey, 'secret');
      assert.equal(options.redirect, 'error');
      assert.ok(!url.href.includes('secret'));
      return Response.json({
        routes: [],
        meta: { next: 'https://bad.example/?apikey=secret', after: 123 },
      });
    },
  });
  const body = await (
    await service.handle(request('routes?lat=43&lon=-87'))
  ).json();
  assert.equal(body.partial, true);
  assert.equal(body.next, '123');
  assert.ok(!JSON.stringify(body).includes('secret'));
  await service.handle(request('routes?lat=43&lon=-87'));
  assert.equal(calls, 1);
  service.close();
});
test('geometry validation rejects bad coordinates and OSM never bridges disconnected ways', () => {
  const body = normalizeTransitOsm('routes', {
    elements: [
      {
        type: 'relation',
        id: 1,
        members: [
          {
            type: 'way',
            geometry: [
              { lon: 1, lat: 2 },
              { lon: 2, lat: 3 },
            ],
          },
          {
            type: 'way',
            geometry: [
              { lon: 10, lat: 20 },
              { lon: 20, lat: 30 },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(transitGeometryLines(body.routes[0].geometry).length, 2);
  assert.deepEqual(
    transitGeometryLines({
      type: 'LineString',
      coordinates: [
        [181, 2],
        [3, 4],
      ],
    }),
    [],
  );
  assert.throws(() => transitOsmQuery('routes', 'bad', 0));
  assert.throws(() =>
    normalizeTransitOsm('routes', { elements: [], remark: 'timed out' }),
  );
});
test('departures disable historical substitution, distinguish estimates, cancelation, and escape content', () => {
  const target = transitNetworkRequest(
    new URL(request('departures?stop=s-test').url),
  ).target;
  assert.equal(target.searchParams.get('use_service_window'), 'false');
  const text = transitDepartureText([
    {
      departures: [
        {
          departure_time: '25:10:00',
          service_date: '2026-09-29',
          schedule_relationship: 'STATIC',
        },
        {
          departure_time: '09:00:00',
          departure: {
            estimated_local: '2026-09-30T09:04:00-05:00',
            delay: 240,
          },
          schedule_relationship: 'SCHEDULED',
        },
        { departure_time: '10:00:00', schedule_relationship: 'CANCELED' },
      ],
    },
  ]);
  assert.match(text, /25:10:00; live estimate unavailable/);
  assert.match(text, /estimated 2026/);
  assert.match(text, /delay 240s/);
  assert.match(text, /CANCELED/);
  assert.equal(escapeTransitText('<script>'), '&lt;script&gt;');
});

test('regional vehicles discover trusted feed IDs and do not fetch provider URLs', async () => {
  const urls = [];
  const service = createTransitNetworkService({
    apiKey: 'test',
    fetchImpl: async (url) => {
      urls.push(url.href);
      if (url.pathname.endsWith('/feeds'))
        return Response.json({
          feeds: [
            {
              onestop_id: 'f-city~rt',
              name: 'City Transit',
              urls: {
                realtime_vehicle_positions:
                  'https://untrusted.invalid/vehicles',
              },
            },
          ],
        });
      return Response.json({
        header: { timestamp: Math.floor(Date.now() / 1000) },
        entity: [
          {
            id: 'bus1',
            vehicle: {
              position: { latitude: 43, longitude: -87 },
              vehicle: { id: '101' },
              trip: { route_id: '30' },
            },
          },
        ],
      });
    },
  });
  const response = await service.handle(
    request('vehicles?lat=43&lon=-87&feed=https://malicious.invalid'),
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.vehicles.length, 1);
  assert.equal(body.vehicles[0].route, '30');
  assert.ok(urls.every((url) => new URL(url).hostname === 'transit.land'));
  assert.match(
    urls[1],
    /f-city~rt\/download_latest_rt\/vehicle_positions.json/,
  );
  service.close();
});
test('stale GPS and stop-relative trains are not drawn as current GPS', () => {
  const now = Date.now(),
    feed = { onestop_id: 'f-test' };
  const stale = {
    header: { timestamp: Math.floor((now - 300000) / 1000) },
    entity: [{ vehicle: { position: { latitude: 40, longitude: -74 } } }],
  };
  assert.deepEqual(normalizeNetworkVehicles(stale, feed, now), []);
  assert.deepEqual(
    normalizeNetworkVehicles(
      {
        header: { timestamp: now / 1000 },
        entity: [
          { vehicle: { stop_id: '123', current_status: 'IN_TRANSIT_TO' } },
        ],
      },
      feed,
      now,
    ),
    [],
  );
});

test('distinct upstream operations are bounded while duplicate requests share work', async () => {
  const done = [];
  const service = createTransitNetworkService({
    apiKey: 'test',
    fetchImpl: () => new Promise((resolve) => done.push(resolve)),
  });
  const pending = [0, 1, 2, 3].map((n) =>
    service.handle(request(`routes?lat=${n}&lon=0`)),
  );
  const duplicate = service.handle(request('routes?lat=0&lon=0'));
  assert.equal(done.length, 4);
  assert.equal(
    (await service.handle(request('routes?lat=4&lon=0'))).status,
    429,
  );
  done.forEach((resolve) => resolve(Response.json({ routes: [] })));
  assert.deepEqual(
    (await Promise.all([...pending, duplicate])).map((r) => r.status),
    [200, 200, 200, 200, 200],
  );
  service.close();
});
