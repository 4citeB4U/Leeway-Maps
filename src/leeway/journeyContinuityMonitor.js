/*
REGION: LeeWay Maps / Journey Continuity
TAG: LEEWAY.JOURNEY.CONTINUITY.MONITOR
WHAT = Non-LLM multimodal journey watch UI for selected transit and aircraft subjects.
WHY = A traveler must be able to keep a bus/train/flight connection visible and inspect evidence without an LLM.
WHO = LeeWay Industries under Creator authority.
WHERE = Map shell dock and journey panel.
WHEN = User opens Journey Watch and selects supported map subjects.
HOW = Capture existing layer selections, preserve source truth, compare authoritative times, frame subjects, open Cockpit or nearby CCTV.
LICENSE = MIT, matching the host repository.
*/

import * as Cesium from 'cesium';
import {
  assessConnection,
  boundsForPoints,
  formatConnectionAssessment,
} from './journeyContinuityCore.js';

function pointFromEntity(entity) {
  try {
    const value = entity?.position?.getValue?.(Cesium.JulianDate.now());
    if (!value) return null;
    const carto = Cesium.Cartographic.fromCartesian(value);
    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
    };
  } catch {
    return null;
  }
}

function parseTime(value) {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function transitKind(id) {
  const match = /^transit-(routes|stops|vehicles):/.exec(String(id || ''));
  return match?.[1] || null;
}

function firstDeparture(entity) {
  const groups = entity?._leewayTransitDepartures;
  if (!Array.isArray(groups)) return null;
  for (const stop of groups) {
    for (const departure of stop?.departures || []) {
      const event = departure.departure || departure.arrival || {};
      const predicted =
        departure.schedule_relationship === 'STATIC' ||
        departure.schedule_relationship === 'NO_DATA'
          ? null
          : parseTime(event.estimated_utc || event.estimated_local);
      const scheduled = parseTime(
        event.scheduled_utc ||
          departure.scheduled_utc ||
          departure.departure_time ||
          departure.arrival_time,
      );
      return {
        departureMs: predicted || scheduled,
        truth: predicted ? 'PREDICTED' : scheduled ? 'SCHEDULED' : 'UNAVAILABLE',
        label:
          departure.trip?.route?.route_short_name ||
          departure.trip?.route?.route_long_name ||
          departure.trip?.trip_id ||
          'Transit',
      };
    }
  }
  return null;
}

export function mountJourneyContinuityMonitor({
  viewer,
  dataManager,
  shell,
  mapViewControls,
  openNearestCctv,
  notify = () => {},
  eventTarget = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  const dock = shell?.querySelector?.('.lws-dock');
  if (!dock || !documentRef) return { destroy() {}, open() {} };

  const launcher = documentRef.createElement('button');
  launcher.type = 'button';
  launcher.className = 'lws-dock-btn';
  launcher.innerHTML = '<span class="i">⇄</span><span>Journey</span>';
  dock.insertBefore(launcher, dock.firstChild);

  const root = documentRef.createElement('section');
  root.className = 'lw-journey-watch';
  root.hidden = true;
  root.innerHTML = `
    <header><div><small>LEEWAY JOURNEY CONTINUITY</small><h2>Connection Watch</h2></div><button type="button" data-close>×</button></header>
    <p class="lj-note">Deterministic navigator. No LLM is required. LIVE, PREDICTED, SCHEDULED and unavailable evidence stay distinct.</p>
    <div class="lj-actions">
      <button type="button" data-add>Add current selection</button>
      <button type="button" data-frame>View together</button>
      <button type="button" data-cockpit>Cockpit flight</button>
      <button type="button" data-cctv>Nearby CCTV</button>
      <button type="button" data-clear>Clear</button>
    </div>
    <div data-status class="lj-status">Select a transit vehicle/stop or aircraft, then add it to the journey.</div>
    <ol data-legs class="lj-legs"></ol>
    <div data-connection class="lj-connection">Add at least two timed legs to evaluate a connection.</div>
  `;
  documentRef.body.append(root);

  const style = documentRef.createElement('style');
  style.textContent = `
    .lw-journey-watch{position:fixed;z-index:11020;right:18px;top:84px;width:min(520px,calc(100vw - 36px));max-height:calc(100dvh - 170px);overflow:auto;padding:16px;border:1px solid rgba(77,223,239,.4);border-radius:18px;background:rgba(3,15,24,.97);color:#effcff;box-shadow:0 24px 70px #0009;font:14px/1.45 Inter,system-ui,sans-serif}
    .lw-journey-watch[hidden]{display:none}.lw-journey-watch header{display:flex;justify-content:space-between;gap:12px;align-items:center}.lw-journey-watch header small{color:#72efff;letter-spacing:.13em}.lw-journey-watch h2{margin:2px 0;font-size:24px}.lw-journey-watch button{border:1px solid rgba(89,220,238,.35);border-radius:9px;background:#0b2935;color:#effcff;padding:8px 10px;cursor:pointer}.lj-actions{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.lj-note{color:#b8d2d9}.lj-status,.lj-connection{padding:10px;border-radius:10px;background:rgba(255,255,255,.04);margin:10px 0}.lj-legs{display:grid;gap:8px;padding-left:22px}.lj-leg{padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#081c27}.lj-leg strong{display:block}.lj-leg small{display:block;color:#a9c4cc}.lj-truth{font-size:10px;font-weight:800;letter-spacing:.06em}.lj-truth.LIVE,.lj-truth.PREDICTED{color:#62f1aa}.lj-truth.SCHEDULED{color:#7eeaff}.lj-truth.UNAVAILABLE,.lj-truth.STALE{color:#ffcb6b}
    body[data-leeway-edition="personal"] .lw-journey-watch{border-color:#d0a329;background:linear-gradient(145deg,#2a2a0e,#0a2416 62%,#2a1014);font-size:16px}body[data-leeway-edition="personal"] .lw-journey-watch header small,body[data-leeway-edition="personal"] .lw-journey-watch .lj-truth.SCHEDULED{color:#ffe36f}body[data-leeway-edition="personal"] .lw-journey-watch button{font-size:15px;border-color:#87b94d;background:#183521}
  `;
  documentRef.head.append(style);

  let currentTransit = null;
  let currentFlight = null;
  let legs = [];

  function flightInfo() {
    const module = dataManager?.layers?.get?.('flights')?.module;
    return module?.getTrackedInfo?.() || null;
  }

  function captureTransit(entity) {
    const kind = transitKind(entity?.id);
    if (!kind) return;
    const departure = firstDeparture(entity);
    currentTransit = {
      key: String(entity.id),
      layerId: 'transit-' + kind,
      kind,
      label: entity.name || String(entity.id),
      point: pointFromEntity(entity),
      arrivalMs: null,
      departureMs: departure?.departureMs || null,
      truth: departure?.truth || (kind === 'vehicles' ? 'LIVE' : 'MAPPED'),
      entity,
    };
    render();
  }

  function captureFlight() {
    const info = flightInfo();
    if (!info) return;
    const schedule = info.schedule || {};
    currentFlight = {
      key: 'flights:' + (info.icao24 || info.registration || info.callsign || 'selected'),
      layerId: 'flights',
      kind: 'flight',
      label: info.callsign || info.registration || info.icao24 || 'Selected aircraft',
      point:
        Number.isFinite(info.latitude) && Number.isFinite(info.longitude)
          ? { lat: info.latitude, lon: info.longitude }
          : null,
      arrivalMs: parseTime(schedule.actualLanding || schedule.estimatedLanding || schedule.scheduledArrival),
      departureMs: parseTime(schedule.actualDeparture || schedule.estimatedDeparture || schedule.scheduledDeparture),
      truth:
        schedule.status === 'available'
          ? schedule.actualLanding || schedule.actualDeparture
            ? 'LIVE'
            : schedule.estimatedLanding || schedule.estimatedDeparture
              ? 'PREDICTED'
              : 'SCHEDULED'
          : 'UNAVAILABLE',
      scheduleRetrievedAt: parseTime(schedule.retrievedAt),
    };
    render();
  }

  function selectedCandidate() {
    const entity = viewer?.selectedEntity;
    if (transitKind(entity?.id)) return currentTransit;
    const info = flightInfo();
    if (info) {
      captureFlight();
      return currentFlight;
    }
    return currentTransit || currentFlight;
  }

  function addCurrent() {
    const candidate = selectedCandidate();
    if (!candidate) {
      notify('Select a transit vehicle/stop or aircraft first');
      return;
    }
    if (!legs.some((leg) => leg.key === candidate.key))
      legs.push({ ...candidate });
    render();
  }

  function connectionResult() {
    if (legs.length < 2) return null;
    const inbound = legs[legs.length - 2];
    const outbound = legs[legs.length - 1];
    return assessConnection({
      inboundArrivalMs: inbound.arrivalMs,
      outboundDepartureMs: outbound.departureMs,
      inboundTruth: inbound.truth,
      outboundTruth: outbound.truth,
      freshnessAgeMs:
        inbound.scheduleRetrievedAt ? Date.now() - inbound.scheduleRetrievedAt : null,
    });
  }

  function render() {
    const list = root.querySelector('[data-legs]');
    list.replaceChildren();
    for (const [index, leg] of legs.entries()) {
      const row = documentRef.createElement('li');
      row.className = 'lj-leg';
      const times = [
        leg.arrivalMs ? 'arrival ' + new Date(leg.arrivalMs).toLocaleString() : '',
        leg.departureMs ? 'departure ' + new Date(leg.departureMs).toLocaleString() : '',
      ].filter(Boolean).join(' · ');
      row.innerHTML =
        '<strong>' + (index + 1) + '. ' + String(leg.label) + '</strong>' +
        '<small>' + String(leg.kind) + (times ? ' · ' + times : ' · timing not supplied by this selection') + '</small>' +
        '<span class="lj-truth ' + String(leg.truth) + '">' + String(leg.truth) + '</span>';
      list.append(row);
    }
    const result = connectionResult();
    root.querySelector('[data-connection]').textContent = result
      ? formatConnectionAssessment(result)
      : 'Add at least two timed legs to evaluate a connection.';
    const candidate = currentTransit || currentFlight;
    root.querySelector('[data-status]').textContent = candidate
      ? 'Current selection: ' + candidate.label + ' · ' + candidate.truth
      : 'Select a transit vehicle/stop or aircraft, then add it to the journey.';
  }

  function frameTogether() {
    captureFlight();
    const points = legs.map((leg) => {
      if (leg.layerId === 'flights' && currentFlight?.key === leg.key)
        return currentFlight.point;
      return leg.point;
    }).filter(Boolean);
    const bounds = boundsForPoints(points);
    if (!bounds) {
      notify('Journey subjects do not yet have enough coordinate evidence to frame together');
      return;
    }
    viewer?.camera?.flyTo?.({
      destination: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
      duration: 1.2,
    });
  }

  async function showNearbyCctv() {
    const target = [...legs].reverse().find((leg) => leg.point)?.point || currentTransit?.point;
    if (target) {
      viewer?.camera?.flyTo?.({
        destination: Cesium.Cartesian3.fromDegrees(target.lon, target.lat, 1800),
        duration: 0.8,
      });
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    const result = await openNearestCctv?.(dataManager, { origin:'journey', durationSec:1.2 });
    notify(result?.ok ? 'Showing the nearest available CCTV camera for this journey area' : 'No usable CCTV camera is available in this journey area');
  }

  const removeTransit = viewer?.selectedEntityChanged?.addEventListener?.(captureTransit);
  const onFlight = () => captureFlight();
  eventTarget?.addEventListener?.('gev:awareness-subject-selected', onFlight);

  launcher.onclick = () => {
    root.hidden = !root.hidden;
    if (!root.hidden) render();
  };
  root.querySelector('[data-close]').onclick = () => { root.hidden = true; };
  root.querySelector('[data-add]').onclick = addCurrent;
  root.querySelector('[data-frame]').onclick = frameTogether;
  root.querySelector('[data-cockpit]').onclick = async () => {
    captureFlight();
    const result = await mapViewControls?.actions?.cockpit?.();
    if (result?.ok === false) notify(result.error || 'Cockpit unavailable');
  };
  root.querySelector('[data-cctv]').onclick = () => void showNearbyCctv();
  root.querySelector('[data-clear]').onclick = () => { legs = []; render(); };

  const timer = setInterval(() => {
    if (!root.hidden) {
      captureFlight();
      render();
    }
  }, 5000);

  return {
    root,
    open() { root.hidden = false; render(); },
    addCurrent,
    getState() { return { legs: legs.map(({ entity, ...leg }) => ({ ...leg })), connection: connectionResult() }; },
    destroy() {
      clearInterval(timer);
      removeTransit?.();
      eventTarget?.removeEventListener?.('gev:awareness-subject-selected', onFlight);
      launcher.remove();
      root.remove();
      style.remove();
    },
  };
}
