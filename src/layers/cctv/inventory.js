const LIMIT = 4000;

/** Refresh regional inventories without rebuilding the layer or selected player. */
export function createInventory({ state, parts, source, debounceMs = 350 }) {
  let timer = null,
    controller = null,
    generation = 0,
    loaded = null;
  function query() {
    const center = parts.navigation.viewCenterLatLon();
    const radiusKm = parts.navigation.scopeRadiusKm();
    return {
      ...(center && Number.isFinite(radiusKm) ? { ...center, radiusKm } : {}),
      limit: LIMIT,
      includeId: state._activeCameraId || undefined,
    };
  }
  function covered(next) {
    if (!loaded) return false;
    if (!Number.isFinite(next.radiusKm))
      return !Number.isFinite(loaded.radiusKm);
    if (!Number.isFinite(loaded.radiusKm) || loaded.radiusKm !== next.radiusKm)
      return false;
    return (
      parts.model.haversineKm(loaded.lat, loaded.lon, next.lat, next.lon) <
      Math.max(1, next.radiusKm * 0.2)
    );
  }
  function cancel() {
    clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    loaded = null;
    ++generation;
  }
  async function refresh() {
    if (!state._enabled || !state._viewer) return false;
    const options = query();
    if (covered(options)) return false;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal,
      owner = ++generation;
    const current = () =>
      !signal.aborted &&
      owner === generation &&
      state._enabled &&
      !!state._viewer;
    try {
      const snapshot = await source.getCatalog({ ...options, signal });
      if (!current()) return false;
      const cameras = parts.catalog.buildCatalogFromSources(snapshot.sources);
      const previous = state._recordById;
      // The player is an explicit user choice and survives a distant map pan.
      const pinned = previous.get(state._activeCameraId);
      const ids = new Set();
      const selected = [];
      if (pinned) ids.add(pinned.camera.id);
      for (const camera of cameras) {
        if (ids.has(camera.id)) continue;
        if (ids.size >= LIMIT) break;
        selected.push(camera);
        ids.add(camera.id);
      }
      const fresh = selected.filter((camera) => !previous.has(camera.id));
      for (const camera of fresh) parts.lifecycle.prepareCamera(camera);
      // Prior resolution is external work; never commit it to a superseded view.
      const priorsPromise = parts.ground.resolveGroundPriors(fresh);
      if (!current()) return false;
      const records = pinned ? [pinned] : [];
      for (const camera of selected) {
        const existing = previous.get(camera.id);
        records.push(
          existing ||
            parts.lifecycle.createRecord(camera, null, records.length),
        );
      }
      parts.geometryQueue.stopGeometryLoadQueue();
      const keep = new Set(records.map((record) => record.camera.id));
      for (const record of state._records)
        if (!keep.has(record.camera.id)) parts.lifecycle.disposeRecord(record);
      state._records = records;
      state._recordById = new Map(
        records.map((record) => [record.camera.id, record]),
      );
      state._count = records.length;
      state._inventoryScope = snapshot.scope || null;
      state._lastError = null;
      loaded = options;
      const additions = records.filter(
        (record) => !previous.has(record.camera.id),
      );
      const additionIds = new Set(additions.map((record) => record.camera.id));
      void priorsPromise
        .then((priors) => {
          if (current() && priors)
            parts.ground.applyLateGroundPriors(additions, priors);
        })
        .catch(() => {});
      // Restart only unresolved/new records; selected runtime remains untouched.
      const pendingGeometry = records.filter(
        (record) =>
          additionIds.has(record.camera.id) ||
          !parts.ground.isGroundResolved(record),
      );
      state._geoLoading = pendingGeometry.length > 0;
      state._geoLoadTotal = pendingGeometry.length;
      state._geoLoadDone = 0;
      state._tilesReadyReenqueued = false;
      parts.geometryQueue.enqueueGeometryRefresh(pendingGeometry);
      if (!state._activeCameraId) {
        const nearest = parts.navigation.nearestCameraIdToViewer?.();
        if (nearest) parts.selection.setActiveCamera(nearest);
      }
      parts.rendering.refreshHorizonCulling();
      parts.cards.refreshAmbientCards();
      parts.presentation.notifyListeners();
      state._viewer.scene.requestRender();
      return true;
    } catch (error) {
      if (current()) {
        state._lastError =
          'Regional camera inventory unavailable; previous cameras retained';
        parts.presentation.notifyListeners();
      }
      return false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!covered(query())) {
      controller?.abort();
      ++generation;
    }
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, debounceMs);
  }
  return { query, refresh, schedule, cancel };
}
