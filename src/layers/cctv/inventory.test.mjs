import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventory } from './inventory.js';

function harness(getCatalog) {
  let center = { lat: 43, lon: -88 };
  const disposed = [],
    made = [];
  const pinned = {
    camera: { id: 'selected' },
    projection: { video: { playing: true } },
  };
  const state = {
    _enabled: true,
    _viewer: { scene: { requestRender() {} } },
    _activeCameraId: 'selected',
    _records: [pinned],
    _recordById: new Map([['selected', pinned]]),
  };
  const parts = {
    navigation: { viewCenterLatLon: () => center, scopeRadiusKm: () => 60 },
    model: { haversineKm: (a, b, c, d) => Math.hypot(a - c, b - d) * 111 },
    catalog: { buildCatalogFromSources: (s) => s },
    ground: {
      resolveGroundPriors: async (records) =>
        records.map(() => ({ ellipsoid: 5 })),
      applyLateGroundPriors() {},
      isGroundResolved: () => true,
    },
    lifecycle: {
      prepareCamera() {},
      createRecord(camera) {
        made.push(camera.id);
        return { camera };
      },
      disposeRecord: (r) => disposed.push(r.camera.id),
    },
    geometryQueue: { stopGeometryLoadQueue() {}, enqueueGeometryRefresh() {} },
    rendering: { refreshHorizonCulling() {} },
    cards: { refreshAmbientCards() {} },
    presentation: { notifyListeners() {} },
  };
  const inventory = createInventory({ state, parts, source: { getCatalog } });
  return {
    inventory,
    state,
    pinned,
    disposed,
    made,
    move: (point) => {
      center = point;
    },
    parts,
  };
}
const snapshot = (prefix, n) => ({
  sources: Array.from({ length: n }, (_, i) => ({ id: prefix + i })),
  scope: { matchedCount: n },
});
test('distant regions replace inventory within4000 while preserving selected player identity', async () => {
  const calls = [];
  const h = harness(async (options) => {
    calls.push(options);
    return snapshot(
      options.lat === 43 ? 'wi' : options.lat === 35 ? 'ok' : 'ia',
      4500,
    );
  });
  await h.inventory.refresh();
  assert.equal(h.state._records.length, 4000);
  assert.equal(h.state._recordById.get('selected'), h.pinned);
  assert.equal(calls[0].includeId, 'selected');
  h.move({ lat: 35, lon: -97 });
  await h.inventory.refresh();
  assert.equal(h.state._records.length, 4000);
  assert.ok(h.state._recordById.has('ok0'));
  assert.ok(!h.state._recordById.has('wi0'));
  assert.equal(h.disposed.length, 3999);
  h.move({ lat: 42, lon: -93 });
  await h.inventory.refresh();
  assert.ok(h.state._recordById.has('ia0'));
  assert.equal(h.pinned.projection.video.playing, true);
  assert.equal(h.state._recordById.get('selected'), h.pinned);
});
test('unchanged region avoids requests, failures retain last usable inventory', async () => {
  let calls = 0;
  const h = harness(async () => {
    if (++calls > 1) throw Error('offline');
    return snapshot('a', 2);
  });
  await h.inventory.refresh();
  assert.equal(await h.inventory.refresh(), false);
  assert.equal(calls, 1);
  const prior = h.state._records;
  h.move({ lat: 20, lon: 20 });
  assert.equal(await h.inventory.refresh(), false);
  assert.equal(h.state._records, prior);
  assert.match(h.state._lastError, /previous cameras retained/);
});
test('reversed fetch completion and disable cannot commit stale inventory', async () => {
  const waiting = [];
  const h = harness(
    (options) => new Promise((resolve) => waiting.push({ options, resolve })),
  );
  const a = h.inventory.refresh();
  h.move({ lat: 35, lon: -97 });
  const b = h.inventory.refresh();
  assert.equal(waiting[0].options.signal.aborted, true);
  waiting[1].resolve(snapshot('new', 1));
  await b;
  waiting[0].resolve(snapshot('old', 1));
  await a;
  assert.ok(h.state._recordById.has('new0'));
  assert.ok(!h.state._recordById.has('old0'));
  h.move({ lat: 20, lon: 20 });
  const c = h.inventory.refresh();
  h.inventory.cancel();
  h.state._enabled = false;
  waiting[2].resolve(snapshot('disabled', 1));
  await c;
  assert.ok(!h.state._recordById.has('disabled0'));
});
test('settled moves debounce and cancellation prevents pending refresh', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const h = harness(async () => {
    calls++;
    return snapshot('a', 1);
  });
  h.inventory.schedule();
  t.mock.timers.tick(200);
  h.inventory.schedule();
  t.mock.timers.tick(200);
  assert.equal(calls, 0);
  t.mock.timers.tick(150);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  h.move({ lat: 20, lon: 20 });
  h.inventory.schedule();
  h.inventory.cancel();
  t.mock.timers.tick(1000);
  assert.equal(calls, 1);
});
test('an empty regional result clears stale regional pins but retains selected media', async () => {
  const h = harness(async () => ({ sources: [], scope: { matchedCount: 0 } }));
  const old = { camera: { id: 'old' } };
  h.state._records.push(old);
  h.state._recordById.set('old', old);
  await h.inventory.refresh();
  assert.deepEqual(h.state._records, [h.pinned]);
  assert.deepEqual(h.disposed, ['old']);
  assert.equal(h.state._inventoryScope.matchedCount, 0);
});

test('late ground responses cannot mutate a cancelled regional load', async () => {
  let resolve;
  const h = harness(async () => snapshot('new', 1));
  let applied = 0;
  h.parts.ground.resolveGroundPriors = () =>
    new Promise((done) => {
      resolve = done;
    });
  h.parts.ground.applyLateGroundPriors = () => applied++;
  await h.inventory.refresh();
  assert.ok(h.state._recordById.has('new0'));
  h.inventory.cancel();
  h.state._enabled = false;
  resolve([{ ellipsoid: 20 }]);
  await Promise.resolve();
  assert.equal(applied, 0);
});

test('eviction disposes only removed camera visuals and runtime', async () => {
  const { createLifecycle } = await import('./lifecycle.js');
  const events = [];
  const entity = {},
    keptEntity = {},
    runtime = {},
    keptRuntime = {};
  const removed = {
    camera: { id: 'removed' },
    billboard: {},
    coverageEntities: [entity],
    projection: runtime,
  };
  const state = {
    _viewer: { entities: { remove: (e) => events.push(e) } },
    _coverageEntities: [entity, keptEntity],
    _projectionEntities: [runtime, keptRuntime],
    _billboards: { remove: (b) => events.push(b) },
    _healthById: new Map([
      ['removed', {}],
      ['kept', {}],
    ]),
  };
  const life = createLifecycle({
    state,
    services: {
      sprites: {},
      activation: {},
      picking: {},
      focus: {},
      render: {},
    },
    parts: {
      geometry: { destroyViewshedVolume: (r) => events.push(r) },
      projection: { destroyProjectionRuntime: (r) => events.push(r) },
    },
  });
  life.disposeRecord(removed);
  assert.deepEqual(state._coverageEntities, [keptEntity]);
  assert.deepEqual(state._projectionEntities, [keptRuntime]);
  assert.equal(state._healthById.has('removed'), false);
  assert.equal(state._healthById.has('kept'), true);
  assert.deepEqual(events, [removed, entity, runtime, removed.billboard]);
});

test('first available regional camera activates only when no player is selected', async () => {
  const h = harness(async () => snapshot('new', 1));
  h.state._activeCameraId = null;
  h.state._records = [];
  h.state._recordById = new Map();
  let selected = null;
  h.parts.navigation.nearestCameraIdToViewer = () =>
    h.state._recordById.has('new0') ? 'new0' : null;
  h.parts.selection = {
    setActiveCamera: (id) => {
      selected = id;
      h.state._activeCameraId = id;
    },
  };
  await h.inventory.refresh();
  assert.equal(selected, 'new0');
});
