import * as Cesium from 'cesium';
import { escapeTransitText, transitGeometryLines, transitAlertText, transitDepartureText } from '../../data/transitNetwork.js';

/** Independent Cesium data sources: toggling routes never clears vehicles or base maps. */
export function createTransitNetworkLayer({ kind = 'routes', services = {}, fetchImpl = (...args) => fetch(...args) } = {}) {
  if (!['routes', 'stops', 'vehicles'].includes(kind)) throw new TypeError('Transit network kind must be routes, stops, or vehicles');
  const id = `transit-${kind}`;
  let viewer, dataSource, enabled = false, request, selectionRequest, removeCamera, removeSelection, timer, manager;
  let count = 0, lastUpdate = null, error = null, coverage = 'Zoom into a city to load transit', generation = 0, activeSource = 'Transit network';
  const credit = new Cesium.Credit('<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a href="https://www.transit.land/terms">Transitland / transit agencies</a>', true);
  const refresh = () => { services.render?.governorRequestRender?.(id); viewer?.scene?.requestRender?.(); manager?.refreshLayerStats?.(); };
  const description = (text) => `<pre style="white-space:pre-wrap">${escapeTransitText(text)}</pre>`;
  async function inspect(entity) {
    selectionRequest?.abort();
    if (!enabled || !entity?._leewayTransitStop) return;
    selectionRequest = new AbortController(); const current = selectionRequest;
    const base = entity._leewayTransitDescription;
    entity.description = description(`${base}\nLoading next departures…`);
    try {
      const response = await fetchImpl(`/api/transit/network/departures?stop=${encodeURIComponent(entity._leewayTransitStop)}`, { signal: current.signal });
      const data = await response.json();
      if (current.signal.aborted) return;
      entity.description = description(`${base}\n\n${response.ok ? transitDepartureText(data.stops) : data.error || 'Departures unavailable'}\nTimes are local to the transit stop. Estimates can change.`);
    } catch { if (!current.signal.aborted) entity.description = description(`${base}\nDepartures unavailable.`); }
    refresh();
  }
  async function update() {
    if (!enabled || !viewer) return;
    request?.abort(); const revision = ++generation;
    const rectangle = viewer.camera.computeViewRectangle?.(viewer.scene.globe?.ellipsoid);
    if (!rectangle || viewer.camera.positionCartographic.height > 180000) {
      dataSource.entities.removeAll(); count = 0; coverage = 'Zoom below 180 km to load nearby transit'; error = null; refresh(); return;
    }
    const center = Cesium.Rectangle.center(rectangle);
    request = new AbortController(); const current = request;
    const query = new URLSearchParams({ lat: Cesium.Math.toDegrees(center.latitude).toFixed(3), lon: Cesium.Math.toDegrees(center.longitude).toFixed(3) });
    try {
      const response = await fetchImpl(`/api/transit/network/${kind}?${query}`, { signal: current.signal });
      const data = await response.json();
      if (!enabled || revision !== generation || current.signal.aborted) return;
      dataSource.entities.removeAll(); count = 0;
      if (!response.ok) throw new Error(data.error || 'Transit network unavailable');
      activeSource = data.mappedOnly ? 'OpenStreetMap · mapped network' : 'Transitland';
      for (const item of (data[kind] || []).slice(0, kind === 'vehicles' ? 3000 : 100)) {
        if (kind === 'vehicles') {
          dataSource.entities.add({ id: `${id}:${item.id}`, name: `${item.operator} · ${item.label} · ${item.route}`,
            description: description(`${item.operator}\nVehicle ${item.label}\nRoute ${item.route}\nTrip ${item.trip}\nGPS observed ${item.observedAt}\n${item.attribution}\nArrival prediction requires a stop schedule; position is not an ETA.`),
            position: Cesium.Cartesian3.fromDegrees(item.longitude, item.latitude),
            point: { pixelSize: 10, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.BLACK, outlineWidth: 1, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 100000 },
          }); count++; continue;
        }
        const key = String(item.onestop_id || item.id || '');
        const name = kind === 'routes' ? [item.route_short_name, item.route_long_name].filter(Boolean).join(' · ') : item.stop_name;
        const copy = `${name || key}\n${item.agency?.agency_name || ''}\n${data.source}\n${data.mappedOnly ? 'Community-mapped network. Timetables, arrivals, alerts, and live vehicles unavailable from this source.' : kind === 'routes' ? 'Published representative route; not live vehicle position.' : 'Select this stop to view the next hour of departures.'}\n${transitAlertText(item.alerts)}\nRetrieved ${data.retrievedAt}`;
        if (kind === 'routes') {
          const color = /^[0-9a-f]{6}$/i.test(item.route_color || '') ? `#${item.route_color}` : '#40c9ff';
          const lines = transitGeometryLines(item.geometry);
          for (const [index, line] of lines.entries()) dataSource.entities.add({
            id: `${id}:${key}:${index}`, name, description: description(copy),
            polyline: { positions: Cesium.Cartesian3.fromDegreesArray(line.flatMap((p) => [p[0], p[1]])), width: 3,
              material: Cesium.Color.fromCssColorString(color), clampToGround: true },
          });
          if (lines.length) count++;
        } else {
          const point = item.geometry?.coordinates;
          if (item.geometry?.type !== 'Point' || !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) continue;
          const entity = dataSource.entities.add({ id: `${id}:${key}`, name, description: description(copy),
            position: Cesium.Cartesian3.fromDegrees(point[0], point[1]),
            point: { pixelSize: 7, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: 100000 },
          });
          entity._leewayTransitStop = data.mappedOnly ? null : key; entity._leewayTransitDescription = copy; count++;
        }
      }
      lastUpdate = Date.now(); error = null;
      coverage = kind === 'vehicles' ? `${count} current GPS fixes · ${data.coverage?.length || 0} feeds checked${count ? '' : '; no accessible current GPS from this source'}` : `${count} ${kind} within ${kind === 'stops' ? '3' : '10'} km${data.partial ? ' · partial results; pan for more' : ''} · ${data.mappedOnly ? 'mapped network; live times unavailable' : 'published routes; no GPS implied'}`;
    } catch (failure) {
      if (revision === generation && !current.signal.aborted) { dataSource.entities.removeAll(); count = 0; error = failure.message; coverage = 'Transit coverage unavailable'; }
    }
    refresh();
  }
  const layer = {
    id, name: kind === 'routes' ? 'Transit routes' : kind === 'stops' ? 'Transit stops & arrivals' : 'Regional transit vehicles', icon: kind === 'routes' ? '🚉' : '🚏', source: 'Transitland', updateInterval: kind === 'vehicles' ? 30000 : 60000,
    init(value) { viewer = value; dataSource = new Cesium.CustomDataSource(id); dataSource.show = false; viewer.dataSources.add(dataSource); },
    enable() {
      enabled = true; dataSource.show = true;
      viewer.scene.frameState?.creditDisplay?.addStaticCredit(credit);
      services.picking?.registerPickOwner?.(id, (pickedId) => String(pickedId).startsWith(`${id}:`));
      if (!removeCamera) removeCamera = viewer.camera.moveEnd.addEventListener(() => { clearTimeout(timer); timer = setTimeout(update, 400); });
      if (!removeSelection) removeSelection = viewer.selectedEntityChanged.addEventListener(inspect);
      void update();
    },
    disable() { enabled = false; generation++; request?.abort(); selectionRequest?.abort(); clearTimeout(timer); removeCamera?.(); removeCamera = null; removeSelection?.(); removeSelection = null; services.picking?.unregisterPickOwner?.(id); viewer?.scene.frameState?.creditDisplay?.removeStaticCredit(credit); if (dataSource) dataSource.show = false; refresh(); },
    update,
    destroy() { layer.disable(); viewer?.dataSources.remove(dataSource, true); viewer = null; dataSource = null; },
    attachDataManager(value) { manager = value; },
    getStats() { return { count, lastUpdate, error, coverage, source: activeSource, status: error ? 'error' : count ? 'active' : 'zoom-in' }; },
  };
  return layer;
}
