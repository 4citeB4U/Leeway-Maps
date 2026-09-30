import * as Cesium from 'cesium';
import { readStationPrices, reportStationPrice } from './stationPrices.js';

export const ROADSIDE_KINDS = Object.freeze({
  fuel: {
    label: 'Fuel stations',
    filter: '["amenity"="fuel"]',
    color: '#67e8c1',
  },
  rest: {
    label: 'Rest areas / services',
    filter: '["highway"~"^(rest_area|services)$"]',
    color: '#8ebaff',
  },
  parking: {
    label: 'Truck parking',
    filter: '["amenity"="parking"]["hgv"~"^(yes|designated)$"]',
    color: '#bfa2ff',
  },
  weigh: {
    label: 'Weigh stations',
    filter: '["amenity"="weighbridge"]',
    color: '#ffc987',
  },
  toll: {
    label: 'Toll booths',
    filter: '["barrier"="toll_booth"]',
    color: '#ffb9d2',
  },
  construction: {
    label: 'Mapped road construction',
    filter: '["highway"="construction"]',
    color: '#ff9c78',
  },
});

export function roadsideQuery(kind, point) {
  if (
    !ROADSIDE_KINDS[kind] ||
    !Number.isFinite(point?.lat) ||
    !Number.isFinite(point?.lon) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(point.lon) > 180
  )
    throw new Error('Choose a valid map location');
  return `[out:json][timeout:25];nwr(around:15000,${point.lat.toFixed(6)},${point.lon.toFixed(6)})${ROADSIDE_KINDS[kind].filter};out center 100;`;
}

export function parseRoadside(payload, kind) {
  if (payload?.remark)
    throw new Error(`Map provider returned incomplete data: ${payload.remark}`);
  if (!Array.isArray(payload?.elements))
    throw new Error('Map provider returned invalid data');
  return payload.elements
    .map((row) => ({
      id: `${row.type}/${row.id}`,
      lat: row.lat ?? row.center?.lat,
      lon: row.lon ?? row.center?.lon,
      label: row.tags?.name || row.tags?.brand || ROADSIDE_KINDS[kind].label,
      operator: row.tags?.operator || '',
      access: row.tags?.access || 'not recorded',
      hours: row.tags?.opening_hours || 'not recorded',
      diesel: row.tags?.['fuel:diesel'] || 'not recorded',
    }))
    .filter(
      (row) =>
        Number.isFinite(row.lat) &&
        Number.isFinite(row.lon) &&
        Math.abs(row.lat) <= 90 &&
        Math.abs(row.lon) <= 180,
    );
}

export function mountRoadsidePlaces({ viewer, getCenter, onAdd, onFuel }) {
  const root = document.createElement('section');
  root.className = 'lw-roadside';
  root.hidden = true;
  root.setAttribute('aria-label', 'Road stops');
  root.innerHTML = `<header><strong>Road stops</strong><button data-close aria-label="Close road stops">×</button></header>
    <p>Search within 15 km of the map center.</p><label>Show <select>${Object.entries(
      ROADSIDE_KINDS,
    )
      .map(([key, row]) => `<option value="${key}">${row.label}</option>`)
      .join('')}</select></label>
    <button data-search>Search this area</button><button data-clear>Clear markers</button>
    <details><summary>Regional diesel cost estimate</summary><p data-benchmark-status>Load the dated EIA weekly regional average.</p><button data-benchmark-load>Load EIA benchmark</button><label hidden data-benchmark-label>Region<select data-benchmark-region></select></label><button data-benchmark-use hidden>Use for route estimate</button><p class="lw-roadside-note">A weekly regional average is not a station price. Refreshes when the app is built; check the report date.</p></details>
    <p data-status role="status">Move the map, then search.</p><div data-results></div>
    <p class="lw-roadside-note">© OpenStreetMap contributors. Up to 100 mapped locations; coverage is incomplete. Confirm truck access, parking availability and station operation. Live fuel prices, toll amounts, closures and inspection status are not supplied.</p>`;
  document.body.appendChild(root);
  const style = document.createElement('style');
  style.textContent = `.lw-roadside{position:fixed;z-index:9890;top:126px;left:16px;width:min(380px,calc(100vw - 56px));max-height:calc(100dvh - 228px);overflow:auto;background:#071722;color:#f1fbff;border:1px solid #46869c;border-radius:16px;padding:16px;font:14px/1.5 Inter,system-ui}.lw-roadside[hidden]{display:none}.lw-roadside header{display:flex;justify-content:space-between;align-items:center}.lw-roadside button,.lw-roadside select{min-height:44px;border-radius:8px;background:#143544;border:1px solid #5a8491;color:inherit;padding:8px;margin:4px;font:inherit;cursor:pointer}.lw-roadside label{display:flex;align-items:center}.lw-roadside select{min-width:0;flex:1}.lw-roadside article{padding:10px 0;border-bottom:1px solid #28424f}.lw-roadside article strong{display:block}.lw-roadside-note{font-size:12px;color:#b2c8d1}@media(max-width:700px){.lw-roadside{top:174px;left:10px;max-height:calc(100dvh - 280px)}}`;
  document.head.appendChild(style);
  let controller = null;
  const markers = [];
  const status = root.querySelector('[data-status]'),
    results = root.querySelector('[data-results]'),
    search = root.querySelector('[data-search]');
  function clear() {
    controller?.abort();
    controller = null;
    for (const entity of markers) viewer.entities.remove(entity);
    markers.length = 0;
    results.replaceChildren();
    search.disabled = false;
    status.textContent = 'Markers cleared.';
    viewer.scene.requestRender();
  }
  root.querySelector('[data-close]').onclick = () => {
    root.hidden = true;
  };
  root.querySelector('[data-clear]').onclick = clear;
  root.querySelector('select').onchange = clear;
  let benchmark = null;
  root.querySelector('[data-benchmark-load]').onclick = async () => {
    const note = root.querySelector('[data-benchmark-status]');
    note.textContent = 'Loading EIA snapshot…';
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}fuel-benchmark.json`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('Weekly snapshot unavailable');
      const data = await response.json();
      if (
        data.kind !== 'WEEKLY_REGIONAL_DIESEL_AVERAGE' ||
        !Array.isArray(data.regions) ||
        !Number.isFinite(Date.parse(data.asOf))
      )
        throw new Error('Invalid benchmark');
      benchmark = data;
      const select = root.querySelector('[data-benchmark-region]');
      select.replaceChildren();
      for (const row of data.regions) {
        if (
          !Number.isFinite(row.priceUsdPerGallon) ||
          row.priceUsdPerGallon <= 0
        )
          continue;
        const option = document.createElement('option');
        option.value = String(row.priceUsdPerGallon);
        option.textContent = `${row.region} · $${row.priceUsdPerGallon.toFixed(3)} / US gal`;
        option.dataset.region = row.region;
        select.appendChild(option);
      }
      const days = Math.floor((Date.now() - Date.parse(data.asOf)) / 86400000);
      note.textContent = `EIA weekly diesel average · ${data.asOf} · ${days} days old.${days > 10 ? ' Older snapshot; verify current EIA prices before planning.' : ''}`;
      root.querySelector('[data-benchmark-label]').hidden = false;
      root.querySelector('[data-benchmark-use]').hidden = false;
    } catch (error) {
      note.textContent = error.message;
    }
  };
  root.querySelector('[data-benchmark-use]').onclick = () => {
    const option = root.querySelector('[data-benchmark-region]')
      .selectedOptions[0];
    if (!option || !benchmark) return;
    onFuel?.(
      Number(option.value),
      `EIA ${option.dataset.region} weekly diesel average · ${benchmark.asOf}`,
    );
    root.hidden = true;
  };
  search.onclick = async () => {
    clear();
    const active = new AbortController();
    controller = active;
    search.disabled = true;
    status.textContent = 'Loading mapped places…';
    const timer = setTimeout(() => active.abort(), 30000);
    try {
      const kind = root.querySelector('select').value;
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: new URLSearchParams({ data: roadsideQuery(kind, getCenter()) }),
        signal: active.signal,
      });
      if (!response.ok) throw new Error(`Map provider HTTP ${response.status}`);
      const rows = parseRoadside(await response.json(), kind);
      if (controller !== active || active.signal.aborted) return;
      for (const row of rows) {
        const article = document.createElement('article'),
          name = document.createElement('strong'),
          details = document.createElement('div'),
          add = document.createElement('button'),
          show = document.createElement('button');
        const fuelDetails =
          kind === 'fuel'
            ? ' · Diesel: ' + row.diesel + ' · Price unavailable'
            : '';
        name.textContent = row.label;
        details.textContent = `${row.operator ? row.operator + ' · ' : ''}Access: ${row.access} · Hours: ${row.hours}${fuelDetails}`;
        add.textContent = 'Add stop';
        add.onclick = () => {
          onAdd(row);
          root.hidden = true;
        };
        show.textContent = 'Show on map';
        show.onclick = () =>
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 1600),
          });
        article.append(name, details, show, add);
        if (kind === 'fuel') {
          const note = document.createElement('p'),
            price = document.createElement('input'),
            fuel = document.createElement('select'),
            report = document.createElement('button'),
            use = document.createElement('button');
          let reported = readStationPrices()[row.id];
          const draw = () => {
            note.textContent = reported
              ? `Reported Station Price: $${Number(reported.priceUsdPerGallon).toFixed(3)}/US gal · ${reported.fuel} · ${reported.reportedAt} · your unverified report on this device`
              : 'No reported station price on this device.';
            use.hidden = !reported;
          };
          price.type = 'number';
          price.min = '0.001';
          price.step = '0.001';
          price.placeholder = 'Price / US gal';
          price.setAttribute('aria-label', `Report price for ${row.label}`);
          for (const type of ['diesel', 'gasoline']) {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            fuel.appendChild(option);
          }
          fuel.setAttribute('aria-label', `Fuel type at ${row.label}`);
          report.textContent = 'Save my price report';
          report.onclick = () => {
            try {
              reported = reportStationPrice(
                row.id,
                Number(price.value),
                fuel.value,
              );
              draw();
            } catch (error) {
              note.textContent = error.message;
            }
          };
          use.textContent = 'Use reported price';
          use.onclick = () => {
            onFuel?.(
              Number(reported.priceUsdPerGallon),
              `Reported Station Price · ${row.label} · ${reported.fuel} · ${reported.reportedAt} · user report, unverified`,
            );
            root.hidden = true;
          };
          draw();
          article.append(note, price, fuel, report, use);
        }
        results.appendChild(article);
        markers.push(
          viewer.entities.add({
            name: row.label,
            position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
            point: {
              pixelSize: 11,
              color: Cesium.Color.fromCssColorString(
                ROADSIDE_KINDS[kind].color,
              ),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          }),
        );
      }
      status.textContent = `${rows.length} mapped places returned · retrieved ${new Date().toLocaleTimeString()}. ${kind === 'construction' ? 'Mapped construction is not a live road-closure feed.' : ''}`;
      viewer.scene.requestRender();
    } catch (error) {
      if (controller === active)
        status.textContent = active.signal.aborted
          ? 'Search timed out or was cancelled. Try a smaller area later.'
          : `Could not load places: ${error.message}`;
    } finally {
      clearTimeout(timer);
      if (controller === active) {
        controller = null;
        search.disabled = false;
      }
    }
  };
  return {
    toggle() {
      root.hidden = !root.hidden;
    },
    destroy() {
      clear();
      root.remove();
      style.remove();
    },
  };
}
