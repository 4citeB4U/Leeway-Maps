import * as Cesium from 'cesium';

const LAYER_ID = 'osm-pipelines';
const REQUEST_DEBOUNCE_MS = 500;

function viewportBox(viewer) {
  const rect = viewer?.camera?.computeViewRectangle?.(
    viewer.scene.globe.ellipsoid,
  );
  if (!rect) return null;
  const south = Cesium.Math.toDegrees(rect.south);
  const west = Cesium.Math.toDegrees(rect.west);
  const north = Cesium.Math.toDegrees(rect.north);
  const east = Cesium.Math.toDegrees(rect.east);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  return { south, west, north, east };
}

function colorFor(record) {
  const substance = String(record.substance || '').toLowerCase();
  if (substance.includes('gas'))
    return Cesium.Color.fromCssColorString('#f2c94c');
  if (substance.includes('oil'))
    return Cesium.Color.fromCssColorString('#ff8b4c');
  if (substance.includes('water'))
    return Cesium.Color.fromCssColorString('#4db7ff');
  return Cesium.Color.fromCssColorString('#b88cff');
}

export function createPipelinesLayer({ source }) {
  if (typeof source?.fetch !== 'function')
    throw new TypeError('Pipeline source required');
  const state = {
    viewer: null,
    dataSource: null,
    enabled: false,
    loading: false,
    lastUpdate: null,
    status: 'idle',
    stale: false,
    saturated: false,
    error: null,
    abort: null,
    debounce: null,
    moveEndRemove: null,
    records: [],
  };

  function clear() {
    state.dataSource?.entities?.removeAll();
  }

  function render(records) {
    clear();
    for (const record of records) {
      const positions = record.geometry.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 3),
      );
      state.dataSource.entities.add({
        id: record.id,
        properties: {
          leewayType: 'pipeline',
          name: record.name,
          operator: record.operator,
          substance: record.substance,
          usage: record.usage,
          location: record.location,
          osmId: record.osmId,
        },
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: colorFor(record).withAlpha(0.88),
            dashLength: 14,
          }),
          clampToGround: true,
        },
      });
    }
  }

  async function load() {
    if (!state.enabled || !state.viewer || state.loading) return;
    const box = viewportBox(state.viewer);
    if (!box) return;
    state.abort?.abort();
    const abort = new AbortController();
    state.abort = abort;
    state.loading = true;
    state.error = null;
    try {
      const snapshot = await source.fetch(box, abort.signal);
      if (abort.signal.aborted || state.abort !== abort || !state.enabled)
        return;
      state.records = snapshot.records || [];
      state.status = snapshot.status || 'ready';
      state.stale = Boolean(snapshot.stale);
      state.saturated = Boolean(snapshot.saturated);
      state.lastUpdate = Date.now();
      render(state.records);
    } catch (error) {
      if (abort.signal.aborted) return;
      state.status = 'unavailable';
      state.error = String(error?.message || error);
    } finally {
      if (state.abort === abort) state.abort = null;
      state.loading = false;
      state.viewer?.scene?.requestRender?.();
    }
  }

  function schedule() {
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => void load(), REQUEST_DEBOUNCE_MS);
  }

  return {
    id: LAYER_ID,
    name: 'Pipelines',
    icon: '╌',
    source: source.label || 'OpenStreetMap',
    updateInterval: 0,
    statsRefreshInterval: 1000,
    init(viewer) {
      state.viewer = viewer;
      state.dataSource = new Cesium.CustomDataSource(LAYER_ID);
      viewer.dataSources.add(state.dataSource);
      state.moveEndRemove = viewer.camera.moveEnd.addEventListener(schedule);
    },
    enable() {
      if (state.enabled) return;
      state.enabled = true;
      state.dataSource.show = true;
    },
    disable() {
      state.enabled = false;
      clearTimeout(state.debounce);
      state.abort?.abort();
      state.abort = null;
      state.dataSource.show = false;
      clear();
      state.status = 'idle';
    },
    update() {
      return load();
    },
    destroy(viewer = state.viewer) {
      this.disable();
      state.moveEndRemove?.();
      state.moveEndRemove = null;
      if (state.dataSource && viewer)
        viewer.dataSources.remove(state.dataSource, true);
      state.dataSource = null;
      state.viewer = null;
    },
    getStats() {
      return {
        count: state.records.length,
        countLabel: state.enabled ? `${state.records.length} mapped` : '',
        lastUpdate: state.lastUpdate,
        stale: state.stale,
        saturated: state.saturated,
        error: state.error,
        status: state.status,
        loading: state.loading,
        loadingLabel:
          state.status === 'zoom-in'
            ? 'Zoom in to load mapped pipelines'
            : state.loading
              ? 'Loading mapped pipelines'
              : '',
      };
    },
  };
}

export { createPipelineSource } from './source.js';
