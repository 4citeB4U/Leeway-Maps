import * as Cesium from 'cesium';
import { createOsmImagery } from '../maps/imagery.js';
import { getSelectedEntityContext } from '../data/contextStore.js';

export function cockpitPoseFromTrackedInfo(info) {
  if (
    !Number.isFinite(info?.latitude) ||
    !Number.isFinite(info?.longitude)
  )
    return null;
  const altitudeM = Number.isFinite(info?.renderAltitudeM)
    ? info.renderAltitudeM
    : Number.isFinite(info?.altitudeM)
      ? info.altitudeM
      : 1000;
  const headingDeg = Number.isFinite(info?.track) ? info.track : 0;
  return {
    latitude: info.latitude,
    longitude: info.longitude,
    altitudeM: Math.max(30, altitudeM + 8),
    headingDeg,
    pitchDeg: -4,
  };
}

function formatSpeed(info) {
  return Number.isFinite(info?.velocityMps)
    ? Math.round(info.velocityMps * 1.94384) + ' kt'
    : 'speed unavailable';
}

function formatAltitude(info) {
  return Number.isFinite(info?.altitudeM)
    ? Math.round(info.altitudeM * 3.28084).toLocaleString() + ' ft'
    : 'altitude unavailable';
}

/**
 * Independent, on-demand cockpit viewport. It never takes ownership of the
 * primary map camera, so CCTV and cockpit can remain visible together.
 */
export function mountPersonalCockpitViewport({
  shell,
  styleManager,
  catalog,
  dataManager,
  documentRef = document,
  notify = () => {},
} = {}) {
  if (!shell || !documentRef) return { open() {}, close() {}, destroy() {} };

  const root = documentRef.createElement('section');
  root.className = 'lm-cockpit-viewport';
  root.hidden = true;
  root.setAttribute('aria-label', 'Cockpit view');
  root.innerHTML = `
    <header>
      <span class="lm-cockpit-dot" aria-hidden="true"></span>
      <strong data-cockpit-channel>Cockpit</strong>
      <button type="button" data-cockpit-close aria-label="Hide cockpit view">×</button>
    </header>
    <div class="lm-cockpit-canvas" data-cockpit-canvas></div>
    <div class="lm-cockpit-readout" data-cockpit-readout>Choose an aircraft on the map.</div>
  `;
  shell.append(root);

  let viewer = null;
  let timer = null;
  let destroyed = false;
  let drag = null;

  const canvasHost = root.querySelector('[data-cockpit-canvas]');
  const readout = root.querySelector('[data-cockpit-readout]');
  const channel = root.querySelector('[data-cockpit-channel]');

  function selectedAircraftTarget() {
    const tracked = styleManager?.getAircraftTrackingTarget?.();
    if (tracked?.id) return tracked;
    const selected = getSelectedEntityContext({ dataManager });
    if (
      selected?.id &&
      ['flights', 'military', 'local-adsb'].includes(selected.layerId)
    )
      return { layerId: selected.layerId, id: selected.id };
    return null;
  }

  function trackedInfo({ attachSelection = false } = {}) {
    const target = selectedAircraftTarget();
    if (!target?.id) return null;
    const layer = catalog?.get?.(target.layerId);
    let info = layer?.getTrackedInfo?.() || null;
    if (!info && attachSelection && typeof layer?.trackById === 'function') {
      layer.trackById(target.id, { origin: 'personal-cockpit' });
      info = layer.getTrackedInfo?.() || null;
    }
    return info;
  }

  function ensureViewer() {
    if (viewer || destroyed) return viewer;
    viewer = new Cesium.Viewer(canvasHost, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    viewer.imageryLayers.addImageryProvider(createOsmImagery());
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
    viewer.resolutionScale = Math.min(
      0.78,
      globalThis.devicePixelRatio > 2 ? 0.58 : 0.72,
    );
    return viewer;
  }

  function update() {
    if (destroyed || root.hidden) return;
    const info = trackedInfo({ attachSelection: true });
    const pose = cockpitPoseFromTrackedInfo(info);
    if (!pose) {
      channel.textContent = 'Cockpit';
      readout.textContent = 'Choose an aircraft on the map to open its independent cockpit view.';
      return;
    }
    const v = ensureViewer();
    channel.textContent =
      info.callsign || info.registration || info.icao24 || 'Cockpit';
    readout.textContent =
      [formatAltitude(info), formatSpeed(info), info.stale ? 'STALE POSITION' : 'source position']
        .join(' · ');
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        pose.longitude,
        pose.latitude,
        pose.altitudeM,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(pose.headingDeg),
        pitch: Cesium.Math.toRadians(pose.pitchDeg),
        roll: 0,
      },
    });
    v.scene.requestRender();
  }

  function open() {
    root.hidden = false;
    update();
    if (!timer) timer = setInterval(update, 500);
    const info = trackedInfo({ attachSelection: true });
    if (!info) {
      notify('Cockpit is ready. Select an aircraft and this view will attach to it.');
      return { ok: true, waitingForAircraft: true };
    }
    return { ok: true, waitingForAircraft: false };
  }

  function close() {
    root.hidden = true;
    if (timer) clearInterval(timer);
    timer = null;
    // A second Cesium context is intentionally on-demand. Release it when the
    // cockpit viewport closes so Personal Maps does not keep two renderers and
    // two imagery stacks resident in GPU memory.
    viewer?.destroy?.();
    viewer = null;
    canvasHost.replaceChildren();
  }

  const header = root.querySelector('header');
  const move = (event) => {
    if (!drag) return;
    const left = Math.max(
      8,
      Math.min(
        globalThis.innerWidth - root.offsetWidth - 8,
        drag.left + event.clientX - drag.x,
      ),
    );
    const top = Math.max(
      86,
      Math.min(
        globalThis.innerHeight - root.offsetHeight - 8,
        drag.top + event.clientY - drag.y,
      ),
    );
    root.style.left = left + 'px';
    root.style.top = top + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };
  const up = () => {
    drag = null;
    globalThis.removeEventListener('pointermove', move);
    globalThis.removeEventListener('pointerup', up);
  };
  const down = (event) => {
    if (event.target.closest('button')) return;
    const rect = root.getBoundingClientRect();
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', up, { once: true });
  };
  header.addEventListener('pointerdown', down);
  root.querySelector('[data-cockpit-close]').addEventListener('click', close);

  return {
    root,
    open,
    close,
    refresh: update,
    destroy() {
      destroyed = true;
      close();
      up();
      header.removeEventListener('pointerdown', down);
      viewer?.destroy?.();
      viewer = null;
      root.remove();
    },
  };
}
