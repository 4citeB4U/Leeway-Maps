import * as Cesium from 'cesium';

/** Shared isolated overlay owner. Text is inserted with textContent, never HTML. */
export function createAlertOverlay({
  id,
  name,
  source,
  load,
  cesium = Cesium,
  now = Date.now,
  documentRef = globalThis.document,
}) {
  let viewer,
    dataSource,
    handler,
    panel,
    timer,
    request,
    generation = 0,
    enabled = false,
    loading = false;
  let snapshot = null,
    error = null,
    listener = null;
  const records = new Map();
  function close() {
    panel?.remove();
    panel = null;
  }
  function showRecords(rows) {
    if (!documentRef || !viewer?.container) return;
    close();
    panel = documentRef.createElement('section');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', name);
    panel.style.cssText =
      'position:absolute;right:18px;top:90px;max-height:65vh;overflow:auto;width:min(420px,85vw);padding:16px;background:#111d2e;color:white;z-index:1200;border:1px solid #80bfff;border-radius:10px;font:14px/1.5 sans-serif;white-space:pre-wrap';
    const button = documentRef.createElement('button');
    button.textContent = 'Close';
    button.onclick = close;
    panel.append(button);
    for (const row of rows.slice(0, 100)) {
      const title = documentRef.createElement('h3');
      title.textContent = row.name;
      const text = documentRef.createElement('p');
      text.textContent = row.text;
      panel.append(title, text);
    }
    if (!rows.length) {
      const p = documentRef.createElement('p');
      p.textContent =
        error ||
        'No current records in this source. This is not proof that no hazards exist.';
      panel.append(p);
    }
    viewer.container.append(panel);
    button.focus();
  }
  function expire() {
    for (const [key, record] of records) {
      if (record.expiresAt <= now()) {
        records.delete(key);
        dataSource?.entities.removeById(key);
      }
    }
    viewer?.scene?.requestRender?.();
    listener?.();
  }
  const layer = {
    id,
    name,
    icon: '⚠',
    source,
    updateInterval: 120000,
    init(value) {
      viewer = value;
      dataSource = new cesium.CustomDataSource(id);
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
      handler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((event) => {
        if (!enabled) return;
        const entity = viewer.scene.pick(event.position)?.id;
        const record = records.get(entity?.id);
        if (record) showRecords([record]);
      }, cesium.ScreenSpaceEventType.LEFT_CLICK);
    },
    enable() {
      enabled = true;
      if (dataSource) dataSource.show = true;
      expire();
      clearInterval(timer);
      timer = setInterval(expire, 15000);
    },
    disable() {
      enabled = false;
      generation++;
      request?.abort();
      request = null;
      loading = false;
      clearInterval(timer);
      timer = null;
      close();
      if (dataSource) dataSource.show = false;
    },
    async update(_viewer, { signal } = {}) {
      if (!enabled || !dataSource) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const epoch = ++generation;
      loading = true;
      try {
        const result = await load({
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        });
        if (
          !enabled ||
          epoch !== generation ||
          controller.signal.aborted ||
          signal?.aborted
        )
          return;
        snapshot = result;
        records.clear();
        dataSource.entities.removeAll();
        for (const row of result.records) {
          if (row.expiresAt <= now()) continue;
          records.set(row.id, row);
          const color = cesium.Color.fromCssColorString(row.color || '#ffae42');
          if (row.geometry?.type === 'Point')
            dataSource.entities.add({
              id: row.id,
              name: row.name,
              position: cesium.Cartesian3.fromDegrees(
                ...row.geometry.coordinates,
              ),
              point: {
                pixelSize: 10,
                color,
                outlineColor: cesium.Color.BLACK,
                outlineWidth: 2,
                heightReference: cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
          const polygons =
            row.geometry?.type === 'Polygon'
              ? [row.geometry.coordinates]
              : row.geometry?.type === 'MultiPolygon'
                ? row.geometry.coordinates
                : [];
          polygons.forEach((rings, index) => {
            const hierarchy = new cesium.PolygonHierarchy(
              cesium.Cartesian3.fromDegreesArray(rings[0].flat()),
              rings
                .slice(1)
                .map(
                  (ring) =>
                    new cesium.PolygonHierarchy(
                      cesium.Cartesian3.fromDegreesArray(ring.flat()),
                    ),
                ),
            );
            const key = index ? `${row.id}:${index}` : row.id;
            records.set(key, row);
            dataSource.entities.add({
              id: key,
              name: row.name,
              polygon: {
                hierarchy,
                material: color.withAlpha(0.22),
                outline: true,
                outlineColor: color,
              },
            });
          });
        }
        error = null;
        viewer.scene.requestRender?.();
      } catch (cause) {
        if (!controller.signal.aborted && epoch === generation)
          error = cause.message || 'Feed unavailable';
      } finally {
        if (request === controller) {
          loading = false;
          request = null;
          expire();
        }
      }
    },
    setParams(params = {}) {
      if (params.list) {
        expire();
        showRecords([
          ...new Map([...records.values()].map((r) => [r.id, r])).values(),
        ]);
      }
    },
    getStats() {
      return {
        count: dataSource?.entities.values.length || 0,
        countLabel: 'Mapped alerts',
        lastUpdate: snapshot?.updatedAt || null,
        source,
        loading,
        error,
        stale:
          !!error ||
          !snapshot ||
          !!snapshot.stale ||
          now() - snapshot.fetchedAt > 300000,
        unmapped: snapshot?.unmapped || 0,
      };
    },
    getRowControls() {
      return {
        chips: [{ id: 'list', label: 'Read alerts', params: { list: true } }],
        summary: {
          label: name,
          detail: `${source}\n${snapshot?.unmapped || 0} alerts have no supplied polygon. ${snapshot?.note || ''}${error ? '\n' + error : ''}`,
          infoTitle:
            'Select a shape or Read alerts for official text. Expired records are removed; missing or stale coverage is not an all-clear.',
        },
      };
    },
    setRowControlsListener(value) {
      listener = value;
    },
    destroy() {
      layer.disable();
      handler?.destroy();
      if (dataSource) viewer?.dataSources?.remove(dataSource, true);
      dataSource = null;
      viewer = null;
      listener = null;
    },
  };
  return layer;
}
