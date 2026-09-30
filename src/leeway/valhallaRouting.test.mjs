import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeValhallaUrl,
  valhallaRequest,
  decodePolyline6,
  normalizeValhallaRoute,
  normalizeValhallaMatrix,
} from './valhallaRouting.js';
import { createRouteClient, DEFAULT_VEHICLE } from './routePlannerCore.js';

const truck = {
  ...DEFAULT_VEHICLE,
  type: 'semi',
  grossWeightKg: 36000,
  axleWeightKg: 9000,
  axleCount: 5,
  hazmat: true,
};
const stops = [
  { lat: 0, lon: 0 },
  { lat: 0.000001, lon: 0.000001 },
];
const response = () => ({
  trip: {
    status: 0,
    units: 'kilometers',
    summary: { length: 2, time: 90, has_toll: false },
    legs: [
      {
        shape: '??AA',
        maneuvers: [{ instruction: 'Go north', length: 2, time: 90 }],
      },
    ],
  },
});

test('Valhalla truck route and matrix use identical dimensional and hazard constraints', () => {
  const route = valhallaRequest(stops, truck),
    matrix = valhallaRequest(stops, truck, {}, true);
  assert.equal(route.costing, 'truck');
  assert.deepEqual(route.costing_options, matrix.costing_options);
  assert.deepEqual(route.costing_options.truck, {
    height: 4.1,
    width: 2.6,
    length: 22,
    weight: 36,
    axle_load: 9,
    axle_count: 5,
    hazmat: true,
    use_tolls: 0.5,
  });
  assert.deepEqual(matrix.sources, route.locations);
  assert.deepEqual(matrix.targets, route.locations);
  assert.equal(matrix.verbose, true);
});
test('soft toll preference does not turn into a hard guarantee', () => {
  const request = valhallaRequest(stops, { ...truck, avoidTolls: true });
  assert.equal(request.costing_options.truck.use_tolls, 0);
  assert.equal(request.costing_options.truck.exclude_tolls, undefined);
  assert.throws(
    () => valhallaRequest(stops, { ...truck, excludeTolls: true }),
    /allow_hard_exclusions/,
  );
  assert.equal(
    valhallaRequest(
      stops,
      { ...truck, excludeTolls: true },
      { hardExclusionsEnabled: true },
    ).costing_options.truck.exclude_tolls,
    true,
  );
});
test('polyline6 geometry converts latitude-first deltas to longitude-latitude coordinates', () => {
  assert.deepEqual(decodePolyline6('??AA'), [
    [0, 0],
    [0.000001, 0.000001],
  ]);
  assert.deepEqual(decodePolyline6('??_c`|@_c`|@'), [
    [0, 0],
    [1, 1],
  ]);
  assert.throws(() => decodePolyline6('?'), /Invalid/);
});
test('Valhalla route evidence never certifies missing restrictions or oversize permits', () => {
  const result = normalizeValhallaRoute(response(), {
    ...truck,
    oversize: true,
  });
  assert.equal(result.distanceM, 2000);
  assert.equal(result.durationS, 90);
  assert.equal(result.truckSafeVerified, false);
  assert.equal(result.oversizePermitVerified, false);
  assert.equal(result.restrictionEvidence, 'MAPPED_RESTRICTIONS_ONLY');
  assert.match(result.authority, /UNVERIFIED/);
  assert.equal(result.steps[0].distanceM, 2000);
});
test('ignored option and clamping warnings block route and matrix acceptance', () => {
  const result = response();
  result.trip.warnings = [
    {
      code: 208,
      text: 'Hard exclusions are not allowed on this server, ignoring hard excludes',
    },
  ];
  assert.throws(() => normalizeValhallaRoute(result, truck), /not accepted/);
  assert.throws(
    () =>
      normalizeValhallaMatrix(
        {
          warnings: [{ description: 'Value clamped' }],
          units: 'kilometers',
          sources_to_targets: [],
        },
        2,
      ),
    /not accepted/,
  );
});
test('hard toll routes reject endpoint tolls and missing evidence', () => {
  for (const has_toll of [true, undefined]) {
    const result = response();
    result.trip.summary.has_toll = has_toll;
    assert.throws(
      () => normalizeValhallaRoute(result, { ...truck, excludeTolls: true }),
      /lacks toll evidence|contains tolls/,
    );
  }
  assert.equal(
    normalizeValhallaRoute(response(), { ...truck, excludeTolls: true })
      .hasTolls,
    false,
  );
});
test('matrix distance units and unreachable cells are normalized without fabricated distances', () => {
  assert.deepEqual(
    normalizeValhallaMatrix(
      {
        units: 'kilometers',
        sources_to_targets: [
          [{ distance: 0 }, { distance: 1.5 }],
          [{ distance: null }, { distance: 0 }],
        ],
      },
      2,
    ),
    [
      [0, 1500],
      [null, 0],
    ],
  );
  assert.throws(
    () =>
      normalizeValhallaMatrix({ units: 'miles', sources_to_targets: [] }, 2),
    /units/,
  );
});

test('malformed warning envelopes and invalid or misordered distances are rejected', () => {
  const badWarnings = response();
  badWarnings.trip.warnings = { code: 208 };
  assert.throws(
    () => normalizeValhallaRoute(badWarnings, truck),
    /warning envelope/,
  );
  const negative = response();
  negative.trip.summary.length = -1;
  assert.throws(
    () => normalizeValhallaRoute(negative, truck),
    /no usable route/,
  );
  assert.throws(
    () =>
      normalizeValhallaMatrix(
        { units: 'kilometers', sources_to_targets: [[{ distance: -1 }]] },
        1,
      ),
    /Invalid Valhalla matrix distance/,
  );
  assert.throws(
    () =>
      normalizeValhallaMatrix(
        {
          units: 'kilometers',
          sources_to_targets: [[{ distance: 1, from_index: 1, to_index: 0 }]],
        },
        1,
      ),
    /location order/,
  );
});
test('only HTTPS and explicit loopback URLs are accepted', () => {
  assert.equal(
    normalizeValhallaUrl('http://127.0.0.1:8002/'),
    'http://127.0.0.1:8002',
  );
  assert.equal(
    normalizeValhallaUrl('https://routing.example/api/'),
    'https://routing.example/api',
  );
  for (const url of [
    'http://remote.example',
    'https://user:pass@example.com',
    'https://example.com/?key=abc',
  ])
    assert.throws(() => normalizeValhallaUrl(url), /HTTPS/);
});
test('configured Valhalla failures never fall back to public passenger routing', async () => {
  const calls = [];
  const client = createRouteClient({
    valhallaUrl: 'https://valhalla.example',
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: false, status: 503 };
    },
  });
  await assert.rejects(
    () => client.route(stops, { profile: truck }),
    /no passenger fallback/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://valhalla.example/route');
  assert.equal(calls[0].body.costing, 'truck');
});
test('routing client connects both actions to selected Valhalla using the same truck profile', async () => {
  const calls = [];
  const client = createRouteClient({
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'POST');
      assert.deepEqual(init.headers, {
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      });
      calls.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () =>
          url.endsWith('/route')
            ? response()
            : {
                units: 'kilometers',
                sources_to_targets: [
                  [{ distance: 0 }, { distance: 2 }],
                  [{ distance: 3 }, { distance: 0 }],
                ],
              },
      };
    },
  });
  const options = { profile: truck, valhallaUrl: 'http://localhost:8002' };
  assert.equal((await client.route(stops, options)).distanceM, 2000);
  assert.deepEqual(await client.matrix(stops, options), [
    [0, 2000],
    [3000, 0],
  ]);
  assert.deepEqual(calls[0].costing_options, calls[1].costing_options);
});
