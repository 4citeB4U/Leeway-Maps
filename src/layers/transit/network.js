import * as Cesium from 'cesium';
import {
  escapeTransitText,
  transitGeometryLines,
  transitAlertText,
  transitDepartureText,
} from '../../data/transitNetwork.js';

/** Independent Cesium data sources: toggling routes never clears vehicles or base maps. */
export function createTransitNetworkLayer({
  kind = 'routes',
  services = {},
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
} = {}) {
  if (!['routes', 'stops', 'vehicles'].includes(kind))
    throw new TypeError(
      'Transit network kind must be routes, stops, or vehicles',
    );
  const id = `transit-${kind}`;
  let viewer,
    dataSource,
    enabled = false,
    request,
    selectionRequest,
    removeCamera,
    removeSelection,
    timer,
    manager,
    card,
    cardText;
  let count = 0,
    lastUpdate = null,
    error = null,
    coverage = 'Zoom into a city to load transit',
    generation = 0,
    activeSource = 'Transit network',
    loading = false,
    activeKey = null,
    displayedKey = null,
    pendingUpdate = null,
    retryAt = 0,
    credentialsRequired = false;
  const credit = new Cesium.Credit(
    '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a href="https://www.transit.land/terms">Transitland / transit agencies</a>',
    true,
  );
  const refresh = () => {
    services.render?.governorRequestRender?.(id);
    viewer?.scene?.requestRender?.();
    manager?.refreshLayerStats?.();
  };
  const description = (text) =>
    `<pre style="white-space:pre-wrap">${escapeTransitText(text)}</pre>`;
  function showCard(text) {
    if (typeof document === 'undefined') return;
    if (!card) {
      card = document.createElement('section');
      card.setAttribute('aria-label', 'Transit details');
      card.style.cssText =
        'position:absolute;left:18px;bottom:70px;z-index:150;max-width:min(430px,85vw);max-height:45vh;overflow:auto;background:#101c2eee;color:#eef7ff;padding:14px;border:1px solid #548599;border-radius:10px;font:13px/1.5 system-ui;pointer-events:auto';
      const close = document.createElement('button');
      close.textContent = 'Close transit details';
      close.onclick = () => {
        card.hidden = true;
        selectionRequest?.abort();
        if (String(viewer?.selectedEntity?.id || '').startsWith(`${id}:`))
          viewer.selectedEntity = undefined;
      };
      cardText = document.createElement('div');
      cardText.style.whiteSpace = 'pre-wrap';
      cardText.setAttribute('aria-live', 'polite');
      card.append(close, cardText);
      (viewer.container || document.body).append(card);
    }
    card.hidden = false;
    cardText.textContent = text;
  }
  async function inspect(entity) {
    selectionRequest?.abort();
    if (!enabled || !String(entity?.id || '').startsWith(`${id}:`)) {
      if (card) card.hidden = true;
      return;
    }
    const plain = entity._leewayTransitDescription || entity.name || 'Transit';
    showCard(plain);
    if (!entity._leewayTransitStop) return;
    selectionRequest = new AbortController();
    const current = selectionRequest;
    const base = entity._leewayTransitDescription;
    entity.description = description(`${base}\nLoading next departures…`);
    showCard(`${base}\nLoading next departures…`);
    try {
      const response = await fetchImpl(
        `/api/transit/network/departures?stop=${encodeURIComponent(entity._leewayTransitStop)}`,
        { signal: current.signal },
      );
      const data = await response.json();
      if (current.signal.aborted) return;
      const text = `${base}\n\n${response.ok ? transitDepartureText(data.stops) : data.error || 'Departures unavailable'}\nTimes are local to the transit stop. Estimates can change.`;
      entity.description = description(text);
      showCard(text);
    } catch {
      if (!current.signal.aborted) {
        entity.description = description(`${base}\nDepartures unavailable.`);
        showCard(`${base}\nDepartures unavailable.`);
      }
    }
    refresh();
  }
  function update(_viewer, { signal, force = false } = {}) {
    if (!enabled || !viewer) return;
    const rectangle = viewer.camera.computeViewRectangle?.(
      viewer.scene.globe?.ellipsoid,
    );
    if (!rectangle || viewer.camera.positionCartographic.height > 180000) {
      request?.abort();
      generation++;
      activeKey = null;
      displayedKey = null;
      loading = false;
      dataSource.entities.removeAll();
      count = 0;
      coverage = 'Zoom below 180 km to load nearby transit';
      if (!credentialsRequired) error = null;
      refresh();
      return;
    }
    const center = Cesium.Rectangle.center(rectangle);
    const query = new URLSearchParams({
      lat: Cesium.Math.toDegrees(center.latitude).toFixed(3),
      lon: Cesium.Math.toDegrees(center.longitude).toFixed(3),
    });
    const key = query.toString();
    if (pendingUpdate && activeKey === key && !request?.signal.aborted)
      return pendingUpdate;
    if (!force && now() < retryAt && (credentialsRequired || activeKey === key))
      return;
    const ttl = kind === 'vehicles' ? 30000 : 300000;
    if (!force && key === displayedKey && !error && now() - lastUpdate < ttl)
      return;
    request?.abort();
    const revision = ++generation;
    request = new AbortController();
    const current = request;
    activeKey = key;
    loading = true;
    error = null;
    if (displayedKey !== key) {
      dataSource.entities.removeAll();
      count = 0;
      if (card) card.hidden = true;
      selectionRequest?.abort();
    }
    refresh();
    const combined = signal
      ? AbortSignal.any([signal, current.signal])
      : current.signal;
    pendingUpdate = performUpdate({
      key,
      revision,
      current,
      query,
      signal: combined,
    }).finally(() => {
      if (request === current) {
        loading = false;
        pendingUpdate = null;
        refresh();
      }
    });
    return pendingUpdate;
  }
  async function performUpdate({ key, revision, current, query, signal }) {
    try {
      const response = await fetchImpl(
        `/api/transit/network/${kind}?${query}`,
        { signal },
      );
      const data = await response.json();
      if (!enabled || revision !== generation || signal.aborted) return;
      if (!response.ok) {
        credentialsRequired = data.status === 'credentials-required';
        retryAt = now() + (credentialsRequired ? 300000 : 30000);
        throw new Error(data.error || 'Transit network unavailable');
      }
      credentialsRequired = false;
      retryAt = 0;
      dataSource.entities.removeAll();
      count = 0;
      activeSource = data.mappedOnly
        ? 'OpenStreetMap · mapped network'
        : 'Transitland';
      for (const item of (data[kind] || []).slice(
        0,
        kind === 'vehicles' ? 3000 : 100,
      )) {
        if (kind === 'vehicles') {
          const entity = dataSource.entities.add({
            id: `${id}:${item.id}`,
            name: `${item.operator} · ${item.label} · ${item.route}`,
            description: description(
              `${item.operator}\nVehicle ${item.label}\nRoute ${item.route}\nTrip ${item.trip}\nGPS observed ${item.observedAt}\n${item.attribution}\nArrival prediction requires a stop schedule; position is not an ETA.`,
            ),
            position: Cesium.Cartesian3.fromDegrees(
              item.longitude,
              item.latitude,
            ),
            point: {
              pixelSize: 10,
              color: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: 100000,
            },
          });
          entity._leewayTransitDescription = `${item.operator}\nVehicle ${item.label} · Route ${item.route}\nTrip ${item.trip}\nGPS observed ${item.observedAt}\n${item.attribution}\nGPS position is not an arrival prediction.`;
          count++;
          continue;
        }
        const key = String(item.onestop_id || item.id || '');
        const name =
          kind === 'routes'
            ? [item.route_short_name, item.route_long_name]
                .filter(Boolean)
                .join(' · ')
            : item.stop_name;
        const copy = `${name || key}\n${item.agency?.agency_name || ''}\n${data.source}\n${data.mappedOnly ? 'Community-mapped network. Timetables, arrivals, alerts, and live vehicles unavailable from this source.' : kind === 'routes' ? 'Published representative route; not live vehicle position.' : 'Select this stop to view the next hour of departures.'}\n${transitAlertText(item.alerts)}\nRetrieved ${data.retrievedAt}`;
        if (kind === 'routes') {
          const color = /^[0-9a-f]{6}$/i.test(item.route_color || '')
            ? `#${item.route_color}`
            : '#40c9ff';
          const lines = transitGeometryLines(item.geometry);
          for (const [index, line] of lines.entries()) {
            const entity = dataSource.entities.add({
              id: `${id}:${key}:${index}`,
              name,
              description: description(copy),
              polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray(
                  line.flatMap((p) => [p[0], p[1]]),
                ),
                width: 3,
                material: Cesium.Color.fromCssColorString(color),
                clampToGround: true,
              },
            });
            entity._leewayTransitDescription = copy;
          }
          if (lines.length) count++;
        } else {
          const point = item.geometry?.coordinates;
          if (
            item.geometry?.type !== 'Point' ||
            !Array.isArray(point) ||
            !Number.isFinite(point[0]) ||
            !Number.isFinite(point[1]) ||
            Math.abs(point[0]) > 180 ||
            Math.abs(point[1]) > 90
          )
            continue;
          const entity = dataSource.entities.add({
            id: `${id}:${key}`,
            name,
            description: description(copy),
            position: Cesium.Cartesian3.fromDegrees(point[0], point[1]),
            point: {
              pixelSize: 7,
              color: Cesium.Color.CYAN,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: 100000,
            },
          });
          entity._leewayTransitStop = data.mappedOnly ? null : key;
          entity._leewayTransitDescription = copy;
          count++;
        }
      }
      lastUpdate = now();
      displayedKey = key;
      error = null;
      coverage =
        kind === 'vehicles'
          ? `${count} current GPS fixes · ${data.coverage?.length || 0} feeds checked${count ? '' : '; no accessible current GPS from this source'}`
          : `${count} ${kind} within ${kind === 'stops' ? '3' : '10'} km${data.partial ? ' · partial results; pan for more' : ''} · ${data.mappedOnly ? 'mapped network; live times unavailable' : 'published routes; no GPS implied'}`;
    } catch (failure) {
      if (revision === generation && !signal.aborted) {
        // Keep an explicitly degraded static network after a temporary outage in
        // the same viewport. Never retain old GPS fixes or another city's map.
        if (kind === 'vehicles' || displayedKey !== key) {
          dataSource.entities.removeAll();
          count = 0;
        }
        retryAt = Math.max(retryAt, now() + 30000);
        error = failure.message;
        coverage = count
          ? 'Previously loaded mapped network · refresh unavailable'
          : 'Transit coverage unavailable';
      }
    }
    refresh();
  }
  const layer = {
    id,
    name:
      kind === 'routes'
        ? 'Transit routes'
        : kind === 'stops'
          ? 'Transit stops & arrivals'
          : 'Regional transit vehicles',
    icon: kind === 'routes' ? '🚉' : '🚏',
    source: 'Transitland',
    updateInterval: kind === 'vehicles' ? 30000 : 60000,
    init(value) {
      viewer = value;
      dataSource = new Cesium.CustomDataSource(id);
      dataSource.show = false;
      viewer.dataSources.add(dataSource);
    },
    enable() {
      enabled = true;
      dataSource.show = true;
      viewer.scene.frameState?.creditDisplay?.addStaticCredit(credit);
      services.picking?.registerPickOwner?.(id, (pickedId) =>
        String(pickedId).startsWith(`${id}:`),
      );
      if (!removeCamera)
        removeCamera = viewer.camera.moveEnd.addEventListener(() => {
          clearTimeout(timer);
          timer = setTimeout(update, 400);
        });
      if (!removeSelection)
        removeSelection =
          viewer.selectedEntityChanged.addEventListener(inspect);
      // LayerLifecycle owns the first update after enable; starting another
      // request here used to abort/restart that request immediately.
    },
    disable() {
      enabled = false;
      generation++;
      request?.abort();
      loading = false;
      pendingUpdate = null;
      selectionRequest?.abort();
      clearTimeout(timer);
      removeCamera?.();
      removeCamera = null;
      removeSelection?.();
      removeSelection = null;
      services.picking?.unregisterPickOwner?.(id);
      viewer?.scene.frameState?.creditDisplay?.removeStaticCredit(credit);
      if (dataSource) dataSource.show = false;
      if (card) card.hidden = true;
      refresh();
    },
    update,
    destroy() {
      layer.disable();
      viewer?.dataSources.remove(dataSource, true);
      card?.remove();
      card = null;
      cardText = null;
      viewer = null;
      dataSource = null;
    },
    attachDataManager(value) {
      manager = value;
    },
    getStats() {
      return {
        count,
        lastUpdate,
        error,
        loading,
        degraded: Boolean(error && count),
        stale: Boolean(error && count),
        coverage,
        source: activeSource,
        status: error ? 'error' : count ? 'active' : 'zoom-in',
      };
    },
  };
  return layer;
}
