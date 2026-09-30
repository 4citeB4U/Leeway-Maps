import * as Cesium from 'cesium';
import {
  createRouteClient,
  DEFAULT_VEHICLE,
  MAX_STOPS,
  VEHICLE_MPG_ASSUMPTIONS,
  moveStop,
  optimizeStopOrder,
  fuelEstimate,
  formatFuelPriceProvenance,
  validPoint,
  currentLocationPoint,
  createPlannerRequests,
  routeCapability,
} from './routePlannerCore.js';
import { formatRouteDuration } from '../data/routeSteps.js';
import { formatDriverDistance as formatRouteDistance } from './driverUnits.js';
import './routePlanner.css';
import { normalizeValhallaUrl } from './valhallaRouting.js';
import {
  addressText,
  createAddressStore,
  importAddresses,
  exportAddresses,
} from './addressStore.js';
import {
  readIncomingSharedAddress,
  clearIncomingSharedAddress,
} from './incomingAddress.js';

/** A standalone planner; container controls whether it is visible. No business login required. */
export function mountRoutePlanner({
  viewer,
  container,
  client = createRouteClient(),
  onStatus = () => {},
}) {
  const root = document.createElement('section');
  root.className = 'lw-route-planner';
  root.innerHTML = `<div class="lrp-heading"><h2>Plan your route</h2><button type="button" data-do="close" aria-label="Close route planner">×</button></div><p>Enter street addresses or place names. Search, then select the matching address.</p><div data-stops></div>
  <div class="lrp-actions"><button type="button" data-do="add">＋ Add stop</button><button type="button" data-do="reverse">Reverse order</button><button type="button" data-do="map">Pick stop on map</button><button type="button" data-do="location">Use my location</button></div>
  <div data-map-confirm hidden><p data-map-address></p><button type="button" data-do="confirm-map">Add route stop</button><button type="button" data-do="discard-map">Cancel</button></div>
  <details><summary>Saved and recent addresses</summary><p>Saved addresses stay on this device. Recent addresses last for this browser session.</p><select data-address-book aria-label="Saved or recent address"></select><div class="lrp-actions"><button type="button" data-do="recall-start">Use as start</button><button type="button" data-do="recall-stop">Add as stop</button><button type="button" data-do="recall-destination">Use as destination</button><button type="button" data-do="delete-saved">Delete saved address</button><button type="button" data-do="clear-recent">Clear recent</button></div></details>
  <details><summary>Import or export route addresses</summary><p>JSON: an array of addresses, or {"addresses":[...]}. CSV: an address column with comma-containing addresses in quotes. Import replaces the current route: 2–12 addresses, including start and destination.</p><input data-import-file type="file" accept=".json,.csv,application/json,text/csv" aria-label="Import route addresses"><div class="lrp-actions"><button type="button" data-do="export-json">Export JSON</button><button type="button" data-do="export-csv">Export CSV</button></div></details>
  <details><summary>Routing server, vehicle and fuel settings</summary>
  <label>Valhalla server URL (optional)<input data-valhalla type="url" placeholder="https://your-routing-server.example"></label>
  <p>Blank uses the public passenger-car service. Your Valhalla server enables truck costing and receives route coordinates. It must allow this app through CORS and contain your driving region. HTTP loopback is supported for local testing.</p>
  <label><input data-hard-exclusions type="checkbox"> Server operator confirms allow_hard_exclusions is enabled</label>
  <div class="lrp-settings">
  <label>Vehicle<select data-profile="type"><option value="car">Passenger car</option><option value="van">Commercial van</option><option value="truck">Rigid truck</option><option value="semi">Semi / tractor trailer</option></select></label>
  <label>Height (m)<input data-profile="heightM" type="number" min="0.1" step="0.1" value="4.1"></label>
  <label>Width (m)<input data-profile="widthM" type="number" min="0.1" step="0.1" value="2.6"></label>
  <label>Length (m)<input data-profile="lengthM" type="number" min="0.1" step="0.1" value="22"></label>
  <label>Gross weight (kg)<input data-profile="grossWeightKg" type="number" min="1" value="36287"></label>
  <label>Axle weight (kg)<input data-profile="axleWeightKg" type="number" min="1" value="9000"></label>
  <label>Axle count<input data-profile="axleCount" type="number" min="2" max="20" step="1" value="5"></label>
  <label>Assumed fuel economy (US MPG)<input data-profile="mpg" type="number" min="0.1" step="0.1" value="25"></label>
  <label>Your fuel price (USD/US gal)<input data-profile="fuelPrice" type="number" min="0" step="0.001" placeholder="Optional"><small data-fuel-provenance>Manual price; no station quote supplied.</small></label>
  </div><label><input data-profile="hazmat" type="checkbox"> Hazardous materials</label><label><input data-profile="oversize" type="checkbox"> Oversize / permit load</label><label><input data-profile="avoidTolls" type="checkbox"> Prefer fewer tolls (Valhalla; may still use tolls)</label>
  <label><input data-profile="excludeTolls" type="checkbox"> Require no toll segments (hard-exclusion server required)</label>
  <p>Valhalla truck costing uses mapped dimensions, weight and hazmat restrictions; incomplete map data and oversize permits remain unverified. Hard exclusion routes with any reported toll segment, including at endpoints, are rejected. Neither provider supplies toll prices.</p>
  <label><input data-preview type="checkbox"> Without Valhalla, allow passenger-road preview for this commercial vehicle (not truck clearance)</label></details>
  <label><input data-optimize type="checkbox" checked> Optimize stop order for estimated fuel use</label><small>Start and destination stay fixed. Uses road distance and constant MPG, not station prices or traffic. Turn off to preserve your order.</small>
  <div class="lrp-actions"><button type="button" data-do="plan" class="lrp-primary">Get road route</button><button type="button" data-do="optimize">Optimize stops</button><button type="button" data-do="cancel">Cancel route</button><button type="button" data-do="clear">Clear all</button></div>
  <p role="status" aria-live="polite" data-status>Ready. Start with two locations.</p><div data-result></div><small>Addresses are sent to OpenStreetMap Nominatim. Route coordinates are sent to your configured Valhalla server, or public OSRM when no server is configured. Availability is not guaranteed. © OpenStreetMap contributors.</small>`;
  (container || document.body).append(root);
  let permanentStorage, sessionAddressStorage;
  try {
    permanentStorage = globalThis.localStorage;
  } catch {}
  try {
    sessionAddressStorage = globalThis.sessionStorage;
  } catch {}
  const addressStore = createAddressStore({
    permanent: permanentStorage,
    session: sessionAddressStorage,
  });
  const listeners = new Set();
  const endpointInput = root.querySelector('[data-valhalla]');
  try {
    endpointInput.value =
      localStorage.getItem('leeway.valhalla.url') ??
      (import.meta.env?.VITE_LEEWAY_VALHALLA_URL || '');
  } catch {
    endpointInput.value = import.meta.env?.VITE_LEEWAY_VALHALLA_URL || '';
  }
  let stops = [{ text: '' }, { text: '' }],
    entities = [],
    mapHandler = null,
    route = null,
    pendingMapPoint = null,
    addressBookRows = [],
    mpgEdited = false,
    fuelPriceProvenance = null;
  const requests = createPlannerRequests();
  const list = root.querySelector('[data-stops]'),
    result = root.querySelector('[data-result]');
  const status = (text) => {
    root.querySelector('[data-status]').textContent = text;
    onStatus(text);
  };
  const snapshot = () => structuredClone({ stops, route, fuelPriceProvenance });
  function emit(type) {
    const event = { type, state: snapshot() };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Route lifecycle listener failed', error);
      }
    }
  }
  function removeRoute() {
    for (const e of entities) viewer.entities.remove(e);
    entities = [];
    route = null;
    result.replaceChildren();
    viewer.scene.requestRender?.();
    emit('route-cleared');
  }
  function disarmMap() {
    mapHandler?.destroy();
    mapHandler = null;
    root.querySelector('[data-do="map"]').textContent = 'Pick stop on map';
    root.classList.remove('is-picking');
  }
  function invalidate() {
    requests.invalidate();
    pendingMapPoint = null;
    root.querySelector('[data-map-confirm]').hidden = true;
    removeRoute();
  }
  function renderAddressBook() {
    const select = root.querySelector('[data-address-book]');
    select.replaceChildren(new Option('Choose a saved or recent address', ''));
    addressBookRows = [];
    for (const kind of ['saved', 'recent']) {
      const rows = addressStore.list(kind);
      if (!rows.length) continue;
      const group = document.createElement('optgroup');
      group.label =
        kind === 'saved' ? 'Saved on this device' : 'Recent this session';
      for (const record of rows) {
        const index = addressBookRows.push({ ...record, kind }) - 1;
        group.append(new Option(record.address, String(index)));
      }
      select.append(group);
    }
  }
  function rememberAddress(stop) {
    try {
      addressStore.remember({
        address: stop.point?.label || stop.text,
        point: stop.point,
      });
      renderAddressBook();
    } catch (error) {
      status(
        `Address selected, but recent history was not saved: ${error.message}`,
      );
    }
  }
  function saveAddress(stop) {
    try {
      addressStore.save({
        address: stop.point?.label || stop.text,
        point: stop.point,
      });
      renderAddressBook();
      status('Address saved on this device.');
    } catch (error) {
      status(`Address was not saved: ${error.message}`);
    }
  }
  function recallAddress(target) {
    const index = root.querySelector('[data-address-book]').value;
    if (index === '') {
      status('Choose a saved or recent address first.');
      return;
    }
    const selected = addressBookRows[Number(index)];
    if (!selected) return;
    const stop = {
      text: selected.address,
      ...(selected.point ? { point: { ...selected.point } } : {}),
    };
    if (target === 'stop' && stops.length >= MAX_STOPS) {
      status('Maximum 12 addresses including start and destination.');
      return;
    }
    invalidate();
    if (target === 'start') stops[0] = stop;
    else if (target === 'destination') stops[stops.length - 1] = stop;
    else stops.splice(stops.length - 1, 0, stop);
    renderStops();
    rememberAddress(stop);
    status('Saved address added. Get a new route.');
  }
  function downloadAddresses(format) {
    try {
      const text = exportAddresses(stops, format),
        blob = new Blob([text], {
          type: format === 'json' ? 'application/json' : 'text/csv',
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `leeway-route-addresses.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('Route address export prepared.');
    } catch (error) {
      status(error.message);
    }
  }
  root
    .querySelector('[data-import-file]')
    .addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const active = requests.capture();
      try {
        if (file.size > 65536)
          throw new Error('Address import must be smaller than 64 KB.');
        const text = await file.text();
        if (!active.isCurrent()) return;
        const imported = importAddresses(
          text,
          file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json',
        );
        invalidate();
        disarmMap();
        stops = imported;
        renderStops();
        status(
          `Imported ${stops.length} addresses. Get road route to find them.`,
        );
      } catch (error) {
        if (active.isCurrent()) status(error.message);
      } finally {
        event.target.value = '';
      }
    });
  async function useMyLocation() {
    if (!navigator.geolocation) {
      status('Location is unavailable in this browser.');
      return null;
    }
    invalidate();
    disarmMap();
    const active = requests.begin();
    status('Waiting for location permission…');
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }),
      );
      if (!active.isCurrent()) return null;
      const point = currentLocationPoint(position);
      stops[0] = { text: point.label, point };
      renderStops();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 2500),
        duration: 1,
      });
      entities.push(
        viewer.entities.add({
          name: 'Your current location',
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
          point: {
            pixelSize: 16,
            color: Cesium.Color.fromCssColorString('#43aaff'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        }),
      );
      viewer.scene.requestRender?.();
      status(
        `Location received (about ${Math.round(position.coords.accuracy)} m accuracy). Finding the street address…`,
      );
      try {
        const resolved = await client.reverse(point, { signal: active.signal });
        if (!active.isCurrent()) return null;
        stops[0] = { text: resolved.label, point: resolved };
        rememberAddress(stops[0]);
        renderStops();
        status('Your current address is the starting point.');
        return resolved;
      } catch (error) {
        if (!active.isCurrent()) return null;
        point.label = 'My current location (address unavailable)';
        stops[0] = { text: point.label, point };
        renderStops();
        status(
          `Device location is available, but the street address could not be found: ${error.message}`,
        );
        return point;
      }
    } catch (error) {
      if (active.isCurrent())
        status(
          error.code === 1
            ? 'Location permission was denied. Allow location access in your browser and try again.'
            : `Location unavailable: ${error.message}`,
        );
      return null;
    }
  }
  async function confirmMapLocation(point) {
    invalidate();
    const active = requests.begin();
    status('Finding the address for that map location…');
    try {
      const resolved = await client.reverse(point, { signal: active.signal });
      if (!active.isCurrent()) return;
      pendingMapPoint = resolved;
      root.querySelector('[data-map-address]').textContent = resolved.label;
      root.querySelector('[data-map-confirm]').hidden = false;
      root
        .querySelector('[data-map-confirm]')
        .scrollIntoView({ block: 'nearest' });
      status('Review the address, then choose Add route stop.');
    } catch (error) {
      if (active.isCurrent())
        status(
          `Map stop was not added: ${error.message} Try a street location or search its address.`,
        );
    }
  }
  function renderStops() {
    list.replaceChildren();
    stops.forEach((stop, index) => {
      const row = document.createElement('div');
      row.className = 'lrp-stop';
      const badge = document.createElement('span');
      badge.className = 'lrp-stop-number';
      badge.textContent = String(index + 1);
      row.append(badge);
      const label = document.createElement('label');
      label.textContent =
        index === 0
          ? 'Start'
          : index === stops.length - 1
            ? 'Destination'
            : `Stop ${index}`;
      const field = document.createElement('input');
      field.value = stop.text;
      field.placeholder = 'Street address, city and state';
      field.setAttribute('aria-label', label.textContent);
      field.autocomplete = 'off';
      field.addEventListener('input', () => {
        stop.text = field.value;
        stop.point = null;
        stop.candidates = null;
        row.querySelector('[data-address-candidates]')?.remove();
        row.querySelector('small')?.remove();
        invalidate();
        status('Location changed. Search and select it before routing.');
      });
      label.append(field);
      row.append(label);
      const controls = document.createElement('div');
      controls.className = 'lrp-actions';
      for (const [text, action, disabled] of [
        ['Search', () => search(index), false],
        ['Save', () => saveAddress(stop), !stop.point],
        ['↑', () => reorder(index, index - 1), index === 0],
        ['↓', () => reorder(index, index + 1), index === stops.length - 1],
        [
          'Remove',
          () => {
            invalidate();
            stops.splice(index, 1);
            renderStops();
          },
          stops.length <= 2,
        ],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.disabled = disabled;
        button.setAttribute(
          'aria-label',
          `${text} ${label.firstChild.textContent}`,
        );
        button.addEventListener('click', () => void action());
        controls.append(button);
      }
      row.append(controls);
      const positionLabel = document.createElement('label');
      positionLabel.textContent = 'Position';
      const position = document.createElement('select');
      position.setAttribute('aria-label', `Position of stop ${index + 1}`);
      stops.forEach((_, n) =>
        position.add(new Option(String(n + 1), String(n))),
      );
      position.value = String(index);
      position.addEventListener('change', () =>
        reorder(index, Number(position.value)),
      );
      positionLabel.append(position);
      row.append(positionLabel);
      if (stop.candidates?.length) {
        const select = document.createElement('select');
        select.dataset.addressCandidates = '';
        select.setAttribute(
          'aria-label',
          `Choose location for stop ${index + 1}`,
        );
        select.add(new Option('Select the matching address', ''));
        stop.candidates.forEach((p, i) =>
          select.add(new Option(p.label, String(i))),
        );
        select.value = stop.point
          ? String(stop.candidates.indexOf(stop.point))
          : '';
        select.addEventListener('change', () => {
          invalidate();
          stop.point =
            select.value === '' ? null : stop.candidates[Number(select.value)];
          if (stop.point) {
            stop.text = stop.point.label;
            rememberAddress(stop);
            renderStops();
          }
          status(
            stop.point ? 'Location selected.' : 'Select an address match.',
          );
        });
        row.append(select);
      }
      if (stop.point) {
        const note = document.createElement('small');
        note.textContent = `Selected: ${stop.point.label || 'Map location; street address unavailable'}`;
        row.append(note);
      }
      list.append(row);
    });
    root.querySelector('[data-do="add"]').disabled = stops.length >= MAX_STOPS;
    emit('stops-changed');
  }
  function reorder(from, to) {
    invalidate();
    stops = moveStop(stops, from, to);
    renderStops();
    status('Stop order changed. Get a new route.');
  }
  async function search(index) {
    invalidate();
    const active = requests.begin();
    const stop = stops[index];
    status('Searching address…');
    try {
      const points = await client.search(stop.text, {
        signal: active.signal,
      });
      if (!active.isCurrent()) return;
      stop.candidates = points;
      stop.point = points.length === 1 ? points[0] : null;
      if (stop.point) {
        stop.text = stop.point.label;
        rememberAddress(stop);
      }
      renderStops();
      status(
        points.length
          ? points.length === 1
            ? 'Location found.'
            : 'Select the matching address from the list.'
          : 'No location found. Try a full street address, city and state.',
      );
    } catch (error) {
      if (active.isCurrent()) status(error.message);
    }
  }
  function profile() {
    const p = { ...DEFAULT_VEHICLE };
    for (const el of root.querySelectorAll('[data-profile]')) {
      const key = el.dataset.profile;
      p[key] =
        el.type === 'checkbox'
          ? el.checked
          : el.type === 'number'
            ? Number(el.value)
            : el.value;
      if (
        el.type === 'number' &&
        (!el.checkValidity() ||
          !Number.isFinite(p[key]) ||
          (key !== 'fuelPrice' && p[key] <= 0))
      )
        throw new Error(
          'Enter valid positive vehicle dimensions, weight and MPG.',
        );
    }
    return p;
  }
  function draw(payload) {
    entities.push(
      viewer.entities.add({
        name: 'Planned road route',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(
            payload.geometry.flatMap((p) => [p[0], p[1]]),
          ),
          width: 6,
          material: Cesium.Color.fromCssColorString('#43d9ff'),
          clampToGround: true,
        },
      }),
    );
    stops.forEach((stop, i) =>
      entities.push(
        viewer.entities.add({
          name: stop.point.label || `Stop ${i + 1}`,
          position: Cesium.Cartesian3.fromDegrees(
            stop.point.lon,
            stop.point.lat,
          ),
          point: {
            pixelSize: 13,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#167da5'),
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: String(i + 1),
            font: 'bold 15px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -24),
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      ),
    );
    void viewer.flyTo(entities, { duration: 1 });
    viewer.scene.requestRender?.();
  }
  async function plan(
    optimize = root.querySelector('[data-optimize]').checked,
  ) {
    invalidate();
    disarmMap();
    const active = requests.begin();
    try {
      const vehicle = profile(),
        options = {
          signal: active.signal,
          profile: vehicle,
          preview: root.querySelector('[data-preview]').checked,
          valhallaUrl: normalizeValhallaUrl(endpointInput.value),
          hardExclusionsEnabled: root.querySelector('[data-hard-exclusions]')
            .checked,
        };
      routeCapability(vehicle, options.preview, options);
      for (let i = 0; i < stops.length; i++)
        if (!stops[i].point) {
          if (stops[i].candidates?.length > 1) {
            status(`Select the matching address for location ${i + 1}.`);
            list.children[i]
              ?.querySelector('[data-address-candidates]')
              ?.focus();
            return null;
          }
          status(`Finding location ${i + 1} of ${stops.length}…`);
          const points = await client.search(stops[i].text, {
            signal: active.signal,
          });
          if (!active.isCurrent()) return null;
          stops[i].candidates = points;
          stops[i].point = points.length === 1 ? points[0] : null;
          if (stops[i].point) {
            stops[i].text = stops[i].point.label;
            rememberAddress(stops[i]);
          }
          renderStops();
          if (!stops[i].point) {
            status(
              points.length
                ? `Select the matching address for location ${i + 1}, then get the route again.`
                : `Location ${i + 1} was not found. Try a full address.`,
            );
            list.children[i]?.querySelector('select,input')?.focus();
            return null;
          }
        }
      status(
        optimize
          ? 'Comparing road distances between stops…'
          : 'Finding the road route…',
      );
      let ordered = stops.slice(),
        savedDistance = 0;
      if (optimize) {
        const matrix = await client.matrix(
          stops.map((s) => s.point),
          options,
        );
        if (!active.isCurrent()) return null;
        const optimal = optimizeStopOrder(matrix);
        const old = matrix.reduce(
          (total, row, i) =>
            i ? total + (matrix[i - 1][i] ?? Infinity) : total,
          0,
        );
        savedDistance = Number.isFinite(old)
          ? Math.max(0, old - optimal.distanceM)
          : 0;
        ordered = optimal.order.map((i) => stops[i]);
      }
      const payload = await client.route(
        ordered.map((s) => s.point),
        options,
      );
      if (!active.isCurrent()) return null;
      stops = ordered;
      renderStops();
      route = {
        ...payload,
        vehicle: { ...vehicle },
        preview: !options.valhallaUrl && options.preview,
        providerEndpoint: options.valhallaUrl || 'public OSRM',
        hardExclusionsEnabled: options.hardExclusionsEnabled,
        fuelPriceProvenance,
        stops: ordered.map((stop) => ({ ...stop.point })),
      };
      draw(payload);
      const estimate = fuelEstimate(
        payload.distanceM,
        vehicle.mpg,
        vehicle.fuelPrice,
      );
      const headline = document.createElement('p');
      headline.textContent = `${formatRouteDistance(payload.distanceM)} · ${formatRouteDuration(payload.durationS)} · ${payload.authority}`;
      result.append(headline);
      const costs = document.createElement('p');
      costs.textContent = estimate
        ? `Estimated fuel: ${estimate.gallons.toFixed(1)} US gal${estimate.cost === null ? ' — enter a fuel price to estimate cost' : ` · $${estimate.cost.toFixed(2)} USD`}. Uses your MPG and price; excludes tolls, idling and traffic.`
        : 'Fuel estimate unavailable.';
      if (fuelPriceProvenance && estimate?.cost != null) {
        costs.textContent += ` Price source: ${formatFuelPriceProvenance(fuelPriceProvenance)}`;
      }
      result.append(costs);
      if (optimize) {
        const info = document.createElement('p');
        info.textContent = `Order optimized by road distance with start and destination fixed. Estimated distance reduction: ${formatRouteDistance(savedDistance)}. This is not traffic-aware or a guarantee of minimum fuel use.`;
        result.append(info);
      }
      const details = document.createElement('details'),
        summary = document.createElement('summary');
      summary.textContent = 'Route instructions (not live navigation)';
      details.append(summary);
      const instructions = document.createElement('ol');
      for (const step of payload.steps || []) {
        const li = document.createElement('li');
        li.textContent = `${step.instruction} · ${formatRouteDistance(step.distanceM)}`;
        instructions.append(li);
      }
      details.append(instructions);
      result.append(details);
      status(`Road route ready. ${payload.source}.`);
      emit('route-ready');
      return structuredClone(route);
    } catch (error) {
      if (active.isCurrent()) status(error.message);
      return null;
    }
  }
  function addMapStop(point, insertionIndex = null) {
    if (!validPoint(point)) {
      status('Choose a valid location on the map.');
      return;
    }
    if (
      insertionIndex !== null &&
      (!Number.isInteger(insertionIndex) ||
        insertionIndex < 1 ||
        insertionIndex >= stops.length)
    ) {
      status('Choose a stop position between the start and destination.');
      return false;
    }
    const empty =
      insertionIndex === null ? stops.findIndex((s) => !s.text) : -1;
    if (stops.length >= MAX_STOPS && empty < 0) {
      status('Maximum 12 locations (10 intermediate stops).');
      return;
    }
    invalidate();
    let label = 'Map location (address unavailable)';
    try {
      if (point.label) label = addressText(point.label);
    } catch {}
    const stop = { text: label, point: { ...point, label } };
    if (empty >= 0) stops[empty] = stop;
    else stops.splice(insertionIndex ?? stops.length - 1, 0, stop);
    renderStops();
    if (point.label) rememberAddress(stop);
    status('Map location added. Get a new route.');
    return true;
  }
  const settingsChanged = (event) => {
    if (
      event.target.matches(
        '[data-profile],[data-preview],[data-valhalla],[data-hard-exclusions],[data-optimize]',
      )
    ) {
      if (event.target.dataset.profile === 'mpg') mpgEdited = true;
      if (event.target.dataset.profile === 'type' && !mpgEdited)
        root.querySelector('[data-profile="mpg"]').value = String(
          VEHICLE_MPG_ASSUMPTIONS[event.target.value] || 25,
        );
      if (event.target.dataset.profile === 'fuelPrice') {
        fuelPriceProvenance = null;
        root.querySelector('[data-fuel-provenance]').textContent =
          'Manual price; no station quote supplied.';
      }
      invalidate();
      status('Vehicle settings changed. Get a new route.');
    }
  };
  root.addEventListener('input', settingsChanged);
  root.addEventListener('change', settingsChanged);
  endpointInput.addEventListener('change', () => {
    try {
      localStorage.setItem(
        'leeway.valhalla.url',
        normalizeValhallaUrl(endpointInput.value),
      );
    } catch (error) {
      status(error.message);
    }
  });
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action) return;
    if (action === 'close') close();
    if (action === 'recall-start') recallAddress('start');
    if (action === 'recall-stop') recallAddress('stop');
    if (action === 'recall-destination') recallAddress('destination');
    if (action === 'delete-saved') {
      const value = root.querySelector('[data-address-book]').value;
      const row = value === '' ? null : addressBookRows[Number(value)];
      if (!row || row.kind !== 'saved') {
        status('Select an address from Saved on this device first.');
        return;
      }
      try {
        addressStore.remove(row.id);
        renderAddressBook();
        status('Saved address deleted.');
      } catch (error) {
        status(error.message);
      }
    }
    if (action === 'clear-recent') {
      try {
        addressStore.clearRecent();
        renderAddressBook();
        status('Recent addresses cleared for this session.');
      } catch (error) {
        status(error.message);
      }
    }
    if (action === 'export-json') downloadAddresses('json');
    if (action === 'export-csv') downloadAddresses('csv');
    if (action === 'confirm-map' && pendingMapPoint) {
      const point = { ...pendingMapPoint };
      addMapStop(point);
    }
    if (action === 'discard-map') {
      pendingMapPoint = null;
      root.querySelector('[data-map-confirm]').hidden = true;
      status('Map stop canceled.');
    }
    if (action === 'plan') void plan();
    if (action === 'optimize') void plan(true);
    if (action === 'add' && stops.length < MAX_STOPS) {
      invalidate();
      stops.splice(stops.length - 1, 0, { text: '' });
      renderStops();
    }
    if (action === 'reverse') {
      invalidate();
      stops.reverse();
      renderStops();
    }
    if (action === 'cancel') {
      invalidate();
      disarmMap();
      status('Route canceled. Locations kept for editing.');
    }
    if (action === 'clear') {
      invalidate();
      disarmMap();
      stops = [{ text: '' }, { text: '' }];
      renderStops();
      status('All locations and route cleared.');
    }
    if (action === 'location') void useMyLocation();
    if (action === 'map') {
      if (mapHandler) {
        disarmMap();
        status('Map selection canceled.');
        return;
      }
      status(
        'Tap the map to look up its street address, then confirm Add route stop.',
      );
      root.classList.add('is-picking');
      root.scrollTop = root.scrollHeight;
      root.querySelector('[data-do="map"]').textContent = 'Cancel map pick';
      mapHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      mapHandler.setInputAction((event) => {
        const ray = viewer.camera.getPickRay(event.position);
        const position =
          (ray && viewer.scene.globe.pick(ray, viewer.scene)) ||
          viewer.camera.pickEllipsoid(event.position);
        if (!position) {
          status('Choose a location on the globe.');
          return;
        }
        const c = Cesium.Cartographic.fromCartesian(position);
        disarmMap();
        void confirmMapLocation({
          lat: Cesium.Math.toDegrees(c.latitude),
          lon: Cesium.Math.toDegrees(c.longitude),
        });
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
  });
  async function routeFromVoice({
    origin = 'current',
    destination,
  } = {}) {
    open();
    let destinationText;
    try {
      destinationText = addressText(destination);
    } catch (error) {
      status(`Destination unavailable: ${error.message}`);
      return { ok: false, reason: 'invalid-destination' };
    }
    invalidate();
    disarmMap();
    if (origin && origin !== 'current') {
      try {
        stops[0] = { text: addressText(origin) };
      } catch (error) {
        status(`Route origin unavailable: ${error.message}`);
        return { ok: false, reason: 'invalid-origin' };
      }
    }
    stops[stops.length - 1] = { text: destinationText };
    renderStops();

    if (!origin || origin === 'current') {
      const point = await useMyLocation();
      if (!point)
        return {
          ok: false,
          reason: 'current-location-unavailable',
          state: snapshot(),
        };
    }

    const nextRoute = await plan(false);
    const unresolvedIndex = stops.findIndex(
      (stop) => !stop.point && stop.candidates?.length,
    );
    return {
      ok: !!nextRoute,
      route: nextRoute,
      needsSelection: unresolvedIndex >= 0,
      locationIndex: unresolvedIndex,
      candidates:
        unresolvedIndex >= 0
          ? stops[unresolvedIndex].candidates.map((point) => point.label)
          : [],
      state: snapshot(),
    };
  }

  async function choosePendingCandidate(choice = 1) {
    const index = stops.findIndex(
      (stop) => !stop.point && stop.candidates?.length,
    );
    if (index < 0) {
      status('There is no pending address choice.');
      return { ok: false, reason: 'no-pending-address' };
    }
    const candidateIndex = Number(choice) - 1;
    const point = stops[index].candidates?.[candidateIndex];
    if (!point) {
      status('That address option is unavailable.');
      return {
        ok: false,
        reason: 'invalid-address-choice',
        candidateCount: stops[index].candidates?.length || 0,
      };
    }
    invalidate();
    stops[index].point = point;
    stops[index].text = point.label;
    rememberAddress(stops[index]);
    renderStops();
    status(`Location ${index + 1} selected by voice. Finding the road route…`);
    const nextRoute = await plan(false);
    return { ok: !!nextRoute, route: nextRoute, state: snapshot() };
  }

  function open() {
    root.hidden = false;
    root.classList.add('open');
    root.querySelector('input')?.focus();
  }
  function close() {
    root.hidden = true;
    root.classList.remove('open');
    disarmMap();
  }
  function toggle(force) {
    (force ?? root.hidden) ? open() : close();
  }
  renderStops();
  renderAddressBook();
  // Android's installed-PWA share target arrives as a URL. Keep the normal
  // address search/selection flow intact; only prefill the destination.
  const sharedAddress = readIncomingSharedAddress(globalThis.location?.search);
  if (sharedAddress) {
    stops[stops.length - 1] = { text: sharedAddress };
    renderStops();
    clearIncomingSharedAddress();
    status(
      'Shared address added as destination. Select the matching address, then get a road route.',
    );
  }
  close();
  if (sharedAddress) open();
  return {
    root,
    open,
    close,
    toggle,
    plan,
    optimize: () => plan(true),
    addMapStop,
    insertMapStop: (point, index) => addMapStop(point, index),
    useMyLocation,
    routeFromVoice,
    choosePendingCandidate,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setFuelPrice(value, provenance) {
      const price = Number(value);
      if (!Number.isFinite(price) || price <= 0) {
        status('Fuel price must be a positive USD per US gallon amount.');
        return false;
      }
      invalidate();
      root.querySelector('[data-profile="fuelPrice"]').value = String(price);
      fuelPriceProvenance =
        String(provenance || '')
          .trim()
          .slice(0, 400) || null;
      root.querySelector('[data-fuel-provenance]').textContent =
        formatFuelPriceProvenance(fuelPriceProvenance);
      status('Fuel price updated. Get a new route to refresh the estimate.');
      return true;
    },
    clear() {
      invalidate();
      disarmMap();
      stops = [{ text: '' }, { text: '' }];
      renderStops();
      status('All locations and route cleared.');
    },
    getState: snapshot,
    destroy() {
      invalidate();
      disarmMap();
      root.remove();
      listeners.clear();
    },
  };
}
