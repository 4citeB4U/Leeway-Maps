import {
  loadTrip,
  deleteTrip,
  prepareTripGuidance,
  offlineGpsState,
} from './offlineTripCore.js';
const $ = (selector) => document.querySelector(selector),
  NS = 'http://www.w3.org/2000/svg';
let trip = null,
  guidance = null,
  watch = null,
  staleTimer = null,
  lastFix = null,
  previous = null,
  epoch = 0,
  project = null;
let view = { x: 0, y: 0, w: 900, h: 480 },
  drag = null;
const distance = (value) =>
  Number.isFinite(value)
    ? value < 160
      ? `${Math.round((value * 3.28084) / 10) * 10} ft`
      : `${(value / 1609.344).toFixed(1)} mi`
    : '—';
function svg(name, attributes) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, String(value));
  return element;
}
function setView() {
  $('#route-map').setAttribute(
    'viewBox',
    `${view.x} ${view.y} ${view.w} ${view.h}`,
  );
}
function plot() {
  const map = $('#route-map');
  map.replaceChildren();
  view = { x: 0, y: 0, w: 900, h: 480 };
  setView();
  const points = trip.route.geometry;
  let last = points[0][0];
  const unwrapped = points.map(([lon, lat]) => {
    last += ((lon - last + 540) % 360) - 180;
    return [last, lat];
  });
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of unwrapped) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const center = (minLon + maxLon) / 2,
    latCenter = (minLat + maxLat) / 2,
    cos = Math.max(0.05, Math.cos((latCenter * Math.PI) / 180));
  const width = Math.max(0.00001, (maxLon - minLon) * cos),
    height = Math.max(0.00001, maxLat - minLat),
    scale = Math.min(820 / width, 400 / height);
  project = ([lon, lat]) => {
    const normal = center + ((lon - center + 540) % 360) - 180;
    return [
      450 + (normal - center) * cos * scale,
      240 - (lat - latCenter) * scale,
    ];
  };
  map.append(
    svg('polyline', {
      points: unwrapped.map((point) => project(point).join(',')).join(' '),
      fill: 'none',
      stroke: '#5de6ff',
      'stroke-width': 5,
      'vector-effect': 'non-scaling-stroke',
      'stroke-linejoin': 'round',
    }),
  );
  const stops = trip.route.stops.length
    ? trip.route.stops
    : [
        { lon: points[0][0], lat: points[0][1], label: 'Start' },
        { lon: points.at(-1)[0], lat: points.at(-1)[1], label: 'Destination' },
      ];
  stops.forEach((stop, index) => {
    const [x, y] = project([stop.lon, stop.lat]);
    map.append(
      svg('circle', {
        cx: x,
        cy: y,
        r: 10,
        fill: index === stops.length - 1 ? '#ffc465' : '#adffce',
        stroke: '#07121b',
        'stroke-width': 2,
      }),
    );
    const text = svg('text', {
      x: x + 13,
      y: y - 13,
      fill: '#fff',
      'font-size': 16,
    });
    text.textContent = String(index + 1);
    map.append(text);
  });
  map.append(
    svg('circle', {
      id: 'gps-marker',
      cx: 0,
      cy: 0,
      r: 10,
      fill: '#4d94ff',
      stroke: '#fff',
      'stroke-width': 4,
      visibility: 'hidden',
    }),
  );
}
function stopGps() {
  epoch++;
  if (watch !== null) navigator.geolocation?.clearWatch(watch);
  watch = null;
  clearInterval(staleTimer);
  staleTimer = null;
  lastFix = null;
  previous = null;
  $('#gps-marker')?.setAttribute('visibility', 'hidden');
  $('#speed').textContent = '—';
  $('#gps-start').disabled = !trip;
  $('#gps-stop').disabled = true;
}
function render() {
  stopGps();
  const result = loadTrip();
  trip = result.trip;
  guidance = null;
  $('#trip-content').hidden = !trip;
  $('#empty').hidden = !!trip;
  $('#delete').disabled = !trip && result.state !== 'unavailable';
  if (!trip) {
    $('#empty-text').textContent =
      result.error ||
      'No saved trip is available. Reconnect and calculate a route first; it will be saved on this device if browser storage permits.';
    return;
  }
  $('#saved-at').textContent =
    `Saved ${new Date(trip.savedAt).toLocaleString()} · ${trip.active ? 'last calculated trip' : 'previous trip — canceled or edited in the online planner'}`;
  $('#stale').hidden = !trip.stale;
  $('#summary').textContent =
    `${distance(trip.route.distanceM)} · ${Math.round(trip.route.durationS / 60)} min original estimate · ${trip.route.source || 'source not recorded'}`;
  $('#authority').textContent =
    `${trip.route.authority || 'Route restrictions unverified'}${trip.route.preview ? ' · passenger-road preview' : ''}. Saved directions do not confirm current traffic, hazards, construction or truck restrictions.`;
  const stops = $('#stops');
  stops.replaceChildren();
  trip.route.stops.forEach((stop) => {
    const item = document.createElement('li');
    item.textContent =
      stop.label || `${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}`;
    stops.append(item);
  });
  const steps = $('#directions');
  steps.replaceChildren();
  for (const step of trip.route.steps) {
    const item = document.createElement('li');
    item.textContent = `${step.instruction} · ${distance(step.distanceM)}`;
    steps.append(item);
  }
  if (!trip.route.steps.length) {
    const item = document.createElement('li');
    item.textContent =
      'No maneuver instructions were supplied with this saved route.';
    steps.append(item);
  }
  plot();
  $('#gps-state').textContent = 'Saved trip ready. GPS is off.';
  $('#remaining').textContent = distance(trip.route.distanceM);
  try {
    guidance = prepareTripGuidance(trip.route);
  } catch (error) {
    $('#gps-state').textContent = error.message;
  }
  $('#gps-start').disabled = !guidance;
}
function updateGps(position, own) {
  if (own !== epoch || !guidance) return;
  lastFix = position;
  const state = offlineGpsState(guidance, position, { previous });
  if (state.progress != null) previous = state.progress;
  $('#speed').textContent =
    state.speed === null ? '—' : String(Math.round(state.speed * 2.236936));
  $('#remaining').textContent = distance(state.remaining);
  $('#gps-state').textContent =
    `${state.nextDistance > 0 ? `In ${distance(state.nextDistance)}: ` : ''}${state.message}`;
  const marker = $('#gps-marker');
  if (state.point && project) {
    const [x, y] = project(state.point);
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('visibility', 'visible');
  } else marker?.setAttribute('visibility', 'hidden');
}
$('#gps-start').onclick = () => {
  if (!guidance) return;
  if (!navigator.geolocation) {
    $('#gps-state').textContent = 'GPS is unavailable in this browser.';
    return;
  }
  stopGps();
  const own = epoch;
  $('#gps-start').disabled = true;
  $('#gps-stop').disabled = false;
  $('#gps-state').textContent =
    'Allow location access to follow this saved route. GPS availability depends on your device.';
  try {
    watch = navigator.geolocation.watchPosition(
      (position) => updateGps(position, own),
      (error) => {
        if (own !== epoch) return;
        lastFix = null;
        $('#speed').textContent = '—';
        $('#remaining').textContent = '—';
        $('#gps-marker')?.setAttribute('visibility', 'hidden');
        $('#gps-state').textContent =
          error.code === 1
            ? 'Location permission denied. Saved directions remain available.'
            : 'GPS unavailable. Saved directions remain available.';
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
    staleTimer = setInterval(() => {
      if (own === epoch && lastFix && Date.now() - lastFix.timestamp > 15000) {
        $('#speed').textContent = '—';
        $('#remaining').textContent = '—';
        $('#gps-marker')?.setAttribute('visibility', 'hidden');
        $('#gps-state').textContent =
          'GPS signal lost. Saved directions remain available; guidance is paused.';
        lastFix = null;
      }
    }, 3000);
  } catch (error) {
    stopGps();
    $('#gps-state').textContent = `GPS could not start: ${error.message}`;
  }
};
$('#gps-stop').onclick = () => {
  stopGps();
  $('#gps-state').textContent =
    'GPS stopped. Saved directions remain available.';
};
$('#delete').onclick = () => {
  stopGps();
  try {
    deleteTrip();
    render();
    $('#empty-text').textContent =
      'Saved route, stops and directions deleted from this browser.';
  } catch (error) {
    $('#gps-state').textContent = `Could not delete trip: ${error.message}`;
  }
};
$('#zoom-in').onclick = () => {
  view.x += view.w * 0.125;
  view.y += view.h * 0.125;
  view.w *= 0.75;
  view.h *= 0.75;
  setView();
};
$('#zoom-out').onclick = () => {
  view.x -= view.w / 6;
  view.y -= view.h / 6;
  view.w /= 0.75;
  view.h /= 0.75;
  setView();
};
$('#fit').onclick = () => {
  view = { x: 0, y: 0, w: 900, h: 480 };
  setView();
};
$('#route-map').onpointerdown = (event) => {
  if (!trip) return;
  drag = { x: event.clientX, y: event.clientY, view: { ...view } };
  event.currentTarget.setPointerCapture(event.pointerId);
};
$('#route-map').onpointermove = (event) => {
  if (!drag) return;
  const rect = event.currentTarget.getBoundingClientRect();
  view.x = drag.view.x - ((event.clientX - drag.x) * view.w) / rect.width;
  view.y = drag.view.y - ((event.clientY - drag.y) * view.h) / rect.height;
  setView();
};
$('#route-map').onpointerup = $('#route-map').onpointercancel = () => {
  drag = null;
};
window.addEventListener('pagehide', stopGps);
window.addEventListener('storage', render);
render();
