import * as Cesium from 'cesium';
import { CCTV_FOCUS_RESULT } from './policy.js';

export function createNavigation({
  state: layerState,
  services,
  parts,
  source,
}) {
  /**
   * Finds the camera closest to the Cesium viewer's current position.
   * @returns {string|null} Camera ID of the nearest camera, or null.
   */

  function viewCenterLatLon() {
    const viewer = layerState._viewer;
    const canvas = viewer?.scene?.canvas;
    if (!viewer?.camera || !canvas) return null;
    try {
      const picked = viewer.camera.pickEllipsoid(
        new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
        viewer.scene.globe?.ellipsoid,
      );
      if (picked) {
        const carto = Cesium.Cartographic.fromCartesian(picked);
        return {
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
        };
      }
    } catch {}
    const carto = viewer.camera.positionCartographic;
    if (!carto) return null;
    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
    };
  }

  function scopeRadiusKm() {
    const height = Number(
      layerState._viewer?.camera?.positionCartographic?.height,
    );
    if (!Number.isFinite(height)) return Number.POSITIVE_INFINITY;
    if (height <= 120_000) return 60;
    if (height <= 350_000) return 100;
    if (height <= 900_000) return 180;
    return Number.POSITIVE_INFINITY;
  }

  function scopedRecordsNearViewer() {
    if (!layerState._records.length) return [];
    const center = viewCenterLatLon();
    const radiusKm = scopeRadiusKm();
    if (!center || !Number.isFinite(radiusKm)) return [...layerState._records];
    const local = layerState._records.filter((record) => {
      const distanceKm = parts.model.haversineKm(
        center.lat,
        center.lon,
        record.camera.lat,
        record.camera.lon,
      );
      return distanceKm <= radiusKm;
    });
    // An unavailable local provider is an empty scope, not permission to
    // substitute a camera thousands of kilometres away. The full catalog stays
    // available when the operator deliberately zooms out to the global view.
    return local;
  }

  const hasMedia = (record) => {
    const caps = record.camera.mediaCapabilities;
    return !caps || (!caps.locationOnly && (caps.video || caps.snapshot));
  };

  function nearestCameraIdToViewer() {
    const center = viewCenterLatLon();
    if (!center || !layerState._records.length) return null;
    const { lat, lon } = center;

    let best = null;
    for (const record of layerState._records) {
      if (!hasMedia(record)) continue;
      const distKm = parts.model.haversineKm(
        lat,
        lon,
        record.camera.lat,
        record.camera.lon,
      );
      if (!best || distKm < best.distKm) {
        best = { id: record.camera.id, distKm };
      }
    }
    return best && best.distKm <= scopeRadiusKm() ? best.id : null;
  }

  /**
   * Flies the Cesium viewer camera to frame the specified CCTV camera,
   * looking along its heading from above.
   * @param {Cesium.Viewer|null} viewer Cesium viewer that owns the camera.
   * @param {Object|null} record CCTV camera runtime record.
   * @param {number} [duration=2.2] - Flight duration in seconds.
   * @returns {'focused'|'no-active-camera'|'tracking-holds-view'|'cockpit-active'} Focus result.
   */

  function focusCctvRecord(viewer, record, duration = 2.2) {
    if (!viewer || !record) return CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
    if (
      typeof document !== 'undefined' &&
      document.body?.classList.contains('cockpit-mode')
    ) {
      console.debug('[Data:CCTV] focus ignored while cockpit owns the camera');
      return CCTV_FOCUS_RESULT.COCKPIT_ACTIVE;
    }
    if (viewer.trackedEntity) {
      console.debug(
        '[Data:CCTV] focus ignored while a tracked entity owns the camera',
      );
      return CCTV_FOCUS_RESULT.TRACKING_HOLDS_VIEW;
    }
    const { camera } = record;
    const range = Math.max(280, camera.rangeM * 1.18);
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(
        record.position,
        Math.max(40, camera.rangeM * 0.36),
      ),
      {
        offset: new Cesium.HeadingPitchRange(
          parts.model.toRad(camera.headingDeg),
          parts.model.toRad(-22),
          range,
        ),
        duration: Math.max(0.2, duration || 0),
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
      },
    );
    return CCTV_FOCUS_RESULT.FOCUSED;
  }

  function focusCamera(cameraId, duration = 2.2) {
    return focusCctvRecord(
      layerState._viewer,
      layerState._recordById.get(cameraId),
      duration,
    );
  }

  /**
   * Advances to the next camera if auto-hop is enabled and the hop interval
   * has elapsed. If the viewer has panned to a new region since the last hop,
   * snaps to the nearest camera instead of cycling sequentially.
   * @param {number} nowMs - Current timestamp in milliseconds.
   */

  function maybeAutoHop(nowMs) {
    if (
      !layerState._autoHop ||
      layerState._autoHopSuspended ||
      !layerState._enabled ||
      layerState._records.length < 2
    )
      return;
    if (nowMs - layerState._lastHopAt < layerState._autoHopSec * 1000) return;

    const viewKey = parts.model.currentViewContext();
    const viewChanged = viewKey !== layerState._lastViewContext;
    layerState._lastViewContext = viewKey;

    if (viewChanged) {
      const nearest = nearestCameraIdToViewer();
      if (nearest && nearest !== layerState._activeCameraId) {
        // Use setActiveCamera so the full activation path runs (obstruction
        // probe, projection runtime, geometry rewrite) — previously bypassed
        // with a bare assignment
        parts.selection.setActiveCamera(nearest);
        layerState._lastHopAt = nowMs;
        return;
      }
    }

    const candidates = scopedRecordsNearViewer().filter(hasMedia);
    if (!candidates.length) return;
    const nextIdx = cctvCycleIndex(
      candidates.findIndex(
        (record) => record.camera.id === layerState._activeCameraId,
      ),
      1,
      candidates.length,
    );
    parts.selection.setActiveCamera(candidates[nextIdx].camera.id);
    layerState._lastHopAt = nowMs;
  }

  /**
   * Resolves a catalog cycle target, including the explicit no-selection state.
   * NEXT from null selects the first record; PREV selects the last.
   * @param {number} currentIdx
   * @param {number} step
   * @param {number} count
   * @returns {number}
   */

  function cctvCycleIndex(currentIdx, step, count) {
    const total = Number.isFinite(count) ? Math.floor(count) : 0;
    if (total <= 0) return -1;
    const delta = Number.isFinite(step) ? Math.trunc(step) : 1;
    if (!Number.isFinite(currentIdx) || currentIdx < 0) {
      return delta < 0 ? total - 1 : 0;
    }
    return (((Math.floor(currentIdx) + delta) % total) + total) % total;
  }
  return {
    viewCenterLatLon,
    scopeRadiusKm,
    scopedRecordsNearViewer,
    nearestCameraIdToViewer,
    focusCctvRecord,
    focusCamera,
    maybeAutoHop,
    cctvCycleIndex,
  };
}
