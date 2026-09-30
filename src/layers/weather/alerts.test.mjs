import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeatherAlerts } from './alerts.js';
import { normalizeTrafficIncidents } from '../traffic/incidents.js';
const now = Date.parse('2026-09-30T00:00:00Z');
const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [-88, 42],
      [-87, 42],
      [-87, 43],
      [-88, 42],
    ],
  ],
};
const alert = {
  id: 'nws1',
  geometry,
  properties: {
    status: 'Actual',
    event: 'Tornado Warning',
    severity: 'Extreme',
    expires: '2026-09-30T01:00:00Z',
    sent: '2026-09-29T23:59:00Z',
    description: 'Official text',
  },
};
const payload = (features) => ({
  type: 'FeatureCollection',
  updated: new Date(now).toISOString(),
  features,
});
test('NWS keeps official text/polygon/expiry and reports polygonless records', () => {
  const result = normalizeWeatherAlerts(
    payload([alert, { ...alert, id: 'nws2', geometry: null }]),
    now,
  );
  assert.equal(result.records.length, 2);
  assert.equal(result.unmapped, 1);
  assert.equal(result.stale, false);
  assert.match(result.records[0].text, /Official text/);
});
test('NWS removes expired, cancelled and test alerts', () => {
  const rows = [
    {
      ...alert,
      properties: { ...alert.properties, expires: '2026-09-29T23:00:00Z' },
    },
    { ...alert, properties: { ...alert.properties, messageType: 'Cancel' } },
    { ...alert, properties: { ...alert.properties, status: 'Test' } },
  ];
  assert.equal(normalizeWeatherAlerts(payload(rows), now).records.length, 0);
});
test('NWS invalid polygon remains an explicitly unmapped alert, stale source flagged', () => {
  const result = normalizeWeatherAlerts(
    {
      ...payload([
        {
          ...alert,
          geometry: { type: 'Polygon', coordinates: [[[-999, 42]]] },
        },
      ]),
      updated: '2026-09-29T22:00:00Z',
    },
    now,
  );
  assert.equal(result.records.length, 1);
  assert.equal(result.unmapped, 1);
  assert.equal(result.stale, true);
});
test('IDOT hides old feed, expired and cleared incidents; retains current official location', () => {
  const p = payload([
    {
      id: 1,
      geometry: { type: 'Point', coordinates: [-87.7, 41.9] },
      properties: {
        id: 'one',
        EndDate: now + 3600000,
        Description: 'Ramp closure',
        Status: 'Updated',
        FullClosure: 'True',
      },
    },
  ]);
  assert.equal(
    normalizeTrafficIncidents(
      p,
      { editingInfo: { dataLastEditDate: now } },
      now,
    ).records.length,
    1,
  );
  assert.equal(
    normalizeTrafficIncidents(
      p,
      { editingInfo: { dataLastEditDate: now - 7200000 } },
      now,
    ).records.length,
    0,
  );
  p.features[0].properties.EndDate = now - 1;
  assert.equal(
    normalizeTrafficIncidents(
      p,
      { editingInfo: { dataLastEditDate: now } },
      now,
    ).records.length,
    0,
  );
});

import { createAlertOverlay } from '../alerts/overlay.js';
test('disabled overlay rejects late completion and removes its owned resources', async () => {
  let resolve,
    removed = 0;
  class DataSource {
    constructor() {
      this.entities = {
        values: [],
        removeAll() {
          this.values = [];
        },
        removeById() {},
        add(row) {
          this.values.push(row);
        },
      };
    }
  }
  class Handler {
    setInputAction() {}
    destroy() {
      removed++;
    }
  }
  const layer = createAlertOverlay({
    id: 'fixture',
    name: 'Fixture',
    source: 'Fixture',
    documentRef: null,
    cesium: {
      CustomDataSource: DataSource,
      ScreenSpaceEventHandler: Handler,
      ScreenSpaceEventType: { LEFT_CLICK: 1 },
    },
    load: () => new Promise((done) => (resolve = done)),
  });
  layer.init({
    dataSources: {
      add() {},
      remove() {
        removed++;
      },
    },
    scene: { canvas: {}, requestRender() {} },
  });
  layer.enable();
  const pending = layer.update();
  layer.disable();
  resolve({ records: [], updatedAt: now, fetchedAt: now });
  await pending;
  assert.equal(layer.getStats().lastUpdate, null);
  assert.equal(layer.getStats().loading, false);
  layer.destroy();
  assert.equal(removed, 2);
});

test('manager cancellation is not exposed as a weather or traffic provider failure', async () => {
  let reject;
  class DataSource {
    constructor() {
      this.entities = { values: [], removeAll() {}, removeById() {} };
    }
  }
  class Handler {
    setInputAction() {}
    destroy() {}
  }
  const layer = createAlertOverlay({
    id: 'cancel-fixture',
    name: 'Fixture',
    source: 'Fixture',
    documentRef: null,
    cesium: {
      CustomDataSource: DataSource,
      ScreenSpaceEventHandler: Handler,
      ScreenSpaceEventType: { LEFT_CLICK: 1 },
    },
    load: () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  });
  layer.init({
    dataSources: { add() {}, remove() {} },
    scene: { canvas: {}, requestRender() {} },
  });
  layer.enable();
  const controller = new AbortController();
  const pending = layer.update(null, { signal: controller.signal });
  controller.abort();
  reject(new DOMException('Aborted', 'AbortError'));
  await pending;
  assert.equal(layer.getStats().error, null);
  assert.equal(layer.getStats().loading, false);
  layer.destroy();
});
