import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createTransitNetworkLayer } from './network.js';

function fixture(fetchImpl, now = () => 1000000) {
  const sources = [];
  let latitude = 43;
  const viewer = {
    scene: { globe: {}, requestRender() {} },
    camera: {
      positionCartographic: { height: 10000 },
      moveEnd: new Cesium.Event(),
      computeViewRectangle: () =>
        Cesium.Rectangle.fromDegrees(
          -88,
          latitude - 0.05,
          -87.9,
          latitude + 0.05,
        ),
    },
    selectedEntityChanged: new Cesium.Event(),
    dataSources: {
      add(source) {
        sources.push(source);
      },
      remove() {},
    },
  };
  const layer = createTransitNetworkLayer({ kind: 'stops', fetchImpl, now });
  layer.init(viewer);
  return {
    layer,
    viewer,
    sources,
    pan(lat) {
      latitude = lat;
    },
  };
}
const snapshot = () =>
  Response.json({
    mappedOnly: true,
    source: 'OpenStreetMap',
    retrievedAt: '2026-09-30',
    stops: [
      {
        id: 'one',
        stop_name: 'A',
        geometry: { type: 'Point', coordinates: [-87.95, 43] },
      },
    ],
  });

test('enable delegates first request to lifecycle; overlapping same-view refresh coalesces and fresh map stays stable', async () => {
  let calls = 0,
    finish,
    signal;
  const f = fixture((_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  f.layer.enable();
  assert.equal(calls, 0);
  const first = f.layer.update(),
    second = f.layer.update();
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  finish(snapshot());
  await first;
  const entity = f.sources[0].entities.values[0];
  await f.layer.update();
  assert.equal(calls, 1);
  assert.equal(f.sources[0].entities.values[0], entity);
  assert.equal(f.layer.getStats().loading, false);
  f.layer.destroy();
});
test('panning supersedes old request; disable prevents a late response resurrecting entities', async () => {
  const requests = [];
  const f = fixture(
    (_url, options) =>
      new Promise((resolve) =>
        requests.push({ resolve, signal: options.signal }),
      ),
  );
  f.layer.enable();
  const first = f.layer.update();
  f.pan(41);
  const second = f.layer.update();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].resolve(snapshot());
  await first;
  assert.equal(f.sources[0].entities.values.length, 0);
  f.layer.disable();
  requests[1].resolve(snapshot());
  await second;
  assert.equal(f.sources[0].entities.values.length, 0);
  assert.equal(f.layer.getStats().loading, false);
  f.layer.destroy();
});
test('same-view static network survives transient refresh failure with stale label and retry cooldown', async () => {
  let clock = 1000000,
    calls = 0;
  const f = fixture(
    async () => {
      calls++;
      return calls === 1
        ? snapshot()
        : Response.json({ error: 'Upstream unavailable' }, { status: 502 });
    },
    () => clock,
  );
  f.layer.enable();
  await f.layer.update();
  clock += 300001;
  await f.layer.update();
  assert.equal(f.layer.getStats().count, 1);
  assert.equal(f.layer.getStats().stale, true);
  assert.equal(f.layer.getStats().error, 'Upstream unavailable');
  await f.layer.update();
  assert.equal(calls, 2);
  f.pan(40);
  await f.layer.update();
  assert.equal(f.layer.getStats().count, 0);
  assert.equal(calls, 3);
  f.layer.destroy();
});
test('missing credentials suppress repeated camera retries and manager signal cancels pending load', async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return Response.json(
      { error: 'Key required', status: 'credentials-required' },
      { status: 503 },
    );
  });
  f.layer.enable();
  await f.layer.update();
  f.pan(41);
  await f.layer.update();
  assert.equal(calls, 1);
  assert.equal(f.layer.getStats().error, 'Key required');
  f.layer.destroy();
  let finish;
  const g = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  g.layer.enable();
  const controller = new AbortController();
  const pending = g.layer.update(null, { signal: controller.signal });
  controller.abort();
  finish(snapshot());
  await pending;
  assert.equal(g.sources[0].entities.values.length, 0);
  g.layer.destroy();
});

test('only schedule-backed stop selection requests departures; late selections cannot overwrite current stop', async () => {
  const calls = [];
  let finish;
  const f = fixture(async (url) => {
    calls.push(url);
    if (url.includes('/departures?'))
      return new Promise((resolve) => {
        finish = resolve;
      });
    return Response.json({
      stops: [
        {
          id: 'stop1',
          stop_name: 'Station',
          geometry: { type: 'Point', coordinates: [-87.95, 43] },
        },
      ],
      source: 'Transitland',
    });
  });
  f.layer.enable();
  await f.layer.update();
  const entity = f.sources[0].entities.values[0];
  f.viewer.selectedEntityChanged.raiseEvent(entity);
  assert.match(calls[1], /departures\?stop=stop1/);
  f.viewer.selectedEntityChanged.raiseEvent(undefined);
  finish(
    Response.json({
      stops: [{ departures: [{ departure_time: '12:00:00' }] }],
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(entity.description.getValue(), /Loading next departures/);
  f.layer.destroy();
});
