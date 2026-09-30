import * as Cesium from 'cesium';
import { createDriveSession } from './driveModeCore.js';
import './driveMode.css';

function distanceLabel(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 160)
    return `${Math.max(0, Math.round((meters * 3.28084) / 10) * 10)} ft`;
  return `${(meters / 1609.344).toFixed(meters < 1609 ? 1 : 1)} mi`;
}

/** Go requests GPS only on click. Planner edits stop the active GPS session. */
export function mountDriveMode({
  planner,
  viewer = null,
  documentRef = document,
  geolocation = navigator.geolocation,
  onCopilot = () => {},
  onCloseCopilot = () => {},
  onRadio = () => {},
} = {}) {
  if (!planner?.root) throw new Error('Drive Mode needs a route planner.');
  const root = documentRef.createElement('section');
  root.className = 'lw-drive';
  root.hidden = true;
  root.setAttribute('aria-label', 'Drive Mode');
  root.innerHTML = `<div class="lw-drive-header"><div><span class="lw-drive-eyebrow">DRIVE MODE</span><p data-drive-authority></p></div><div class="lw-drive-actions"><button type="button" data-drive-copilot>Agent Lee</button><button type="button" data-drive-radio>Driver radio</button><button type="button" data-drive-exit>Exit Drive</button></div></div>
    <div class="lw-drive-instruction" role="status" aria-live="polite"><div data-drive-distance>Waiting for GPS</div><h1 data-drive-maneuver>Allow location access</h1><p data-drive-status></p></div>
    <div class="lw-drive-bottom"><div class="lw-drive-speed"><strong data-drive-speed>—</strong><span>MPH · GPS</span></div><div class="lw-drive-remaining"><strong data-drive-remaining>—</strong><span>remaining · estimate</span></div><button type="button" data-drive-follow aria-pressed="true">Follow on</button></div>`;
  documentRef.body.append(root);
  const go = documentRef.createElement('button');
  go.type = 'button';
  go.className = 'lrp-go-drive';
  go.textContent = 'Go';
  go.disabled = !planner.getState?.().route;
  go.setAttribute('aria-label', 'Go: start Drive Mode with GPS location');
  const actions = planner.root.querySelector('[data-do="plan"]')?.parentElement;
  (actions || planner.root).append(go);
  let active = false,
    follow = true,
    positionEntity = null;
  const query = (selector) => root.querySelector(selector);
  // Reserve the actual instruction height: long maneuvers and GPS errors wrap
  // differently on phones. Keep the copilot below that protected region.
  function measureGuidance() {
    if (!active) return;
    const bottom = query('.lw-drive-instruction').getBoundingClientRect()
      .bottom;
    documentRef.body.style.setProperty(
      '--leeway-drive-guidance-bottom',
      `${Math.ceil(bottom + 12)}px`,
    );
  }
  const ResizeObserverClass = documentRef.defaultView?.ResizeObserver;
  const layoutObserver = ResizeObserverClass
    ? new ResizeObserverClass(measureGuidance)
    : null;
  layoutObserver?.observe(query('.lw-drive-header'));
  layoutObserver?.observe(query('.lw-drive-instruction'));
  function removeMarker() {
    if (positionEntity) {
      try {
        viewer?.entities.remove(positionEntity);
      } catch {}
      positionEntity = null;
    }
  }
  function update(state) {
    if (!active) return;
    root.dataset.state = state.state;
    query('[data-drive-speed]').textContent =
      state.speedMps === null || state.speedMps === undefined
        ? '—'
        : String(Math.round(state.speedMps * 2.236936));
    query('[data-drive-remaining]').textContent = distanceLabel(
      state.remainingM,
    );
    query('[data-drive-distance]').textContent = state.instruction
      ? state.nextDistanceM > 0
        ? `In ${distanceLabel(state.nextDistanceM)}`
        : 'Now'
      : 'GUIDANCE PAUSED';
    query('[data-drive-maneuver]').textContent =
      state.instruction || state.message;
    query('[data-drive-status]').textContent =
      state.state === 'off-route'
        ? 'No automatic rerouting. Exit Drive and calculate a new route.'
        : state.instruction
          ? 'GPS route estimate · observe road signs and conditions'
          : 'Speed and instructions require a current, accurate GPS fix.';
    measureGuidance();
    if (!state.point || !viewer) {
      if (!state.point) removeMarker();
      return;
    }
    try {
      const position = Cesium.Cartesian3.fromDegrees(
        state.point[0],
        state.point[1],
      );
      if (!positionEntity)
        positionEntity = viewer.entities.add({
          name: 'Your GPS position',
          position,
          point: {
            pixelSize: 16,
            color: Cesium.Color.fromCssColorString('#21d4fd'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 4,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Infinity,
          },
        });
      else positionEntity.position = position;
      if (follow)
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            state.point[0],
            state.point[1],
            650,
          ),
          orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        });
      viewer.scene.requestRender();
    } catch {
      /* GPS guidance remains usable if optional map following fails. */
    }
  }
  const session = createDriveSession({ geolocation, onUpdate: update });
  function stop() {
    active = false;
    onCloseCopilot();
    session.stop();
    removeMarker();
    root.hidden = true;
    documentRef.body.classList.remove('leeway-drive-mode');
    documentRef.body.style.removeProperty('--leeway-drive-guidance-bottom');
  }
  function start(route = planner.getState?.().route) {
    stop();
    active = true;
    root.hidden = false;
    documentRef.body.classList.add('leeway-drive-mode');
    query('[data-drive-authority]').textContent =
      route?.preview ||
      (route?.vehicle?.type &&
        route.vehicle.type !== 'car' &&
        /OSRM/i.test(route?.source || ''))
        ? 'Passenger-road preview · truck clearance unverified'
        : 'Road route · live restrictions are not guaranteed';
    try {
      const started = session.start(route);
      planner.close?.();
      query('[data-drive-exit]').focus();
      return started;
    } catch (error) {
      update({ state: 'unavailable', speedMps: null, message: error.message });
      return false;
    }
  }
  go.addEventListener('click', () => start());
  query('[data-drive-copilot]').addEventListener('click', onCopilot);
  query('[data-drive-radio]').addEventListener('click', onRadio);
  query('[data-drive-exit]').addEventListener('click', () => {
    stop();
    planner.open?.();
  });
  query('[data-drive-follow]').addEventListener('click', (event) => {
    follow = !follow;
    event.currentTarget.textContent = follow ? 'Follow on' : 'Follow off';
    event.currentTarget.setAttribute('aria-pressed', String(follow));
  });
  const unsubscribe = planner.subscribe?.((event) => {
    go.disabled = !event.state?.route;
    if (event.type !== 'route-ready') stop();
  });
  return {
    start,
    stop,
    root,
    destroy() {
      stop();
      unsubscribe?.();
      layoutObserver?.disconnect();
      root.remove();
      go.remove();
    },
  };
}
