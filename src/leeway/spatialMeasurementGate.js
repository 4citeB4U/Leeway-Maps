function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function enabledLayerRows(dataManager) {
  return (dataManager?.getAll?.() || []).filter((row) => row?.enabled);
}

function movingSubjectCount(rows) {
  let total = 0;
  for (const row of rows) {
    const id = String(row.id || '');
    const stats = row.stats || {};
    if (id === 'transit') total += Number(stats.movingCount || 0);
    else if (['flights', 'military', 'ais-live-vessels'].includes(id))
      total += Number(stats.count || 0);
  }
  return total;
}

export function buildSpatialMeasurement({
  dataManager,
  placesOverlay,
  frameTimes,
  interactionLatencyMs,
  at = Date.now(),
} = {}) {
  const rows = enabledLayerRows(dataManager);
  const transit = rows.find((row) => row.id === 'transit')?.stats || {};
  const placeStats = placesOverlay?.getStats?.() || {};
  const visibleSpatialCandidateCount = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.stats?.count || 0)),
    0,
  );
  const frameTimeMs = percentile(frameTimes || [], 95);
  const values = [
    visibleSpatialCandidateCount,
    movingSubjectCount(rows),
    Number.isFinite(transit.mapMatchMeanDeviationM)
      ? transit.mapMatchMeanDeviationM
      : null,
    Number(placeStats.renderedCount || 0),
    frameTimeMs,
    Number.isFinite(interactionLatencyMs) ? interactionLatencyMs : null,
  ];
  const complete = values.every(Number.isFinite);
  return {
    at,
    complete,
    dimensionOrder: [
      'visible_spatial_candidate_count',
      'continuous_motion_subject_count',
      'transit_route_deviation_m',
      'rendered_label_count',
      'frame_time_ms',
      'interaction_latency_ms',
    ],
    values,
    context: {
      enabledLayers: rows.map((row) => row.id),
      places: placeStats,
      transit: {
        count: transit.count ?? null,
        visibleCount: transit.visibleCount ?? null,
        movingCount: transit.movingCount ?? null,
        mapMatchCompleted: transit.mapMatchCompleted ?? null,
        mapMatchRejected: transit.mapMatchRejected ?? null,
      },
    },
  };
}

export function mountSpatialMeasurementGate({
  shell,
  dataManager,
  placesOverlay,
  documentRef = document,
  windowRef = window,
} = {}) {
  const params = new URLSearchParams(windowRef.location?.search || '');
  const enabled = params.get('spatialMeasure') === '1';
  if (!enabled)
    return {
      enabled: false,
      getRows: () => [],
      getObservations: () => [],
      destroy() {},
    };

  const frameTimes = [];
  const observations = [];
  let interactionLatencyMs = null;
  let interactionStart = null;
  let rafId = null;
  let lastFrameAt = performance.now();
  let timer = null;
  let destroyed = false;

  function frame(now) {
    if (destroyed) return;
    const delta = now - lastFrameAt;
    lastFrameAt = now;
    if (delta > 0 && delta < 1000) {
      frameTimes.push(delta);
      if (frameTimes.length > 240) frameTimes.shift();
    }
    rafId = windowRef.requestAnimationFrame(frame);
  }

  function onPointerDown() {
    interactionStart = performance.now();
  }

  function onPointerUp() {
    if (!Number.isFinite(interactionStart)) return;
    const started = interactionStart;
    interactionStart = null;
    windowRef.requestAnimationFrame(() => {
      interactionLatencyMs = performance.now() - started;
    });
  }

  function sample() {
    const observation = buildSpatialMeasurement({
      dataManager,
      placesOverlay,
      frameTimes,
      interactionLatencyMs,
    });
    observations.push(observation);
    if (observations.length > 256) observations.shift();
  }

  shell?.addEventListener?.('pointerdown', onPointerDown, true);
  shell?.addEventListener?.('pointerup', onPointerUp, true);
  rafId = windowRef.requestAnimationFrame(frame);
  timer = windowRef.setInterval(sample, 2000);
  sample();

  const api = {
    enabled: true,
    getObservations: () => observations.map((row) => structuredClone(row)),
    getRows: () =>
      observations
        .filter((row) => row.complete)
        .map((row) => row.values.slice()),
    latest: () =>
      observations.length ? structuredClone(observations.at(-1)) : null,
    exportTrace() {
      return {
        schemaVersion: '1.0.0',
        mappingId: 'personal-map-spatial-density-v0',
        provenance: 'LIVE_BROWSER_MEASUREMENT',
        createdAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        observations: api.getObservations(),
      };
    },
    destroy() {
      destroyed = true;
      if (rafId != null) windowRef.cancelAnimationFrame(rafId);
      if (timer != null) windowRef.clearInterval(timer);
      shell?.removeEventListener?.('pointerdown', onPointerDown, true);
      shell?.removeEventListener?.('pointerup', onPointerUp, true);
    },
  };
  windowRef.__leewaySpatialTelemetry = api;
  return api;
}
