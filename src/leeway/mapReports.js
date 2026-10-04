import { weatherCodeLabel } from '../data/regionalModel.js';

export function weatherReport(payload, now = Date.now()) {
  const w = payload?.weather;
  if (!w || !Number.isFinite(w.temperatureC)) return 'Weather unavailable';
  const stale = payload.status === 'stale' || !Number.isFinite(Date.parse(w.observedAt)) || now - Date.parse(w.observedAt) > 3600000;
  return `${stale ? 'Older weather · ' : ''}${Math.round(w.temperatureC * 9 / 5 + 32)}°F · ${weatherCodeLabel(w.weatherCode)}${Number.isFinite(w.windKph) ? ` · Wind ${Math.round(w.windKph / 1.609)} mph` : ''}`;
}

export function trafficReport(rows, point) {
  if (!point) return 'Traffic · Waiting for your location';
  const traffic = rows.find((row) => row.id === 'traffic');
  const incident = rows.find((row) => row.id === 'traffic-incidents');
  if (traffic?.enabled) {
    if (traffic.stats?.loading) return 'Traffic · Loading local roads';
    if (traffic.stats?.error) return 'Traffic · Local flow unavailable';
    if (traffic.stats?.mode === 'live') {
      const coverage = Number(traffic.stats?.flowCoveragePct);
      return Number.isFinite(coverage)
        ? `Traffic · Live flow · ${coverage}% matched`
        : 'Traffic · Live local flow';
    }
    if (traffic.stats?.mode === 'sim')
      return 'Traffic · Simulated flow · live source unavailable';
  }
  const inIllinois =
    point.lon >= -91.6 &&
    point.lon <= -87.4 &&
    point.lat >= 36.9 &&
    point.lat <= 42.6;
  if (inIllinois && incident?.enabled) {
    if (incident.stats?.loading) return 'Traffic · Loading local incidents';
    if (incident.stats?.stale || incident.stats?.error)
      return 'Traffic · Incident source unavailable or outdated';
    return 'Traffic · Illinois incident reports';
  }
  return 'Traffic · Tap for local flow';
}

/** Viewport reports never claim that the viewport is the user's GPS position. */
export function mountMapReports({
  shell,
  viewer,
  dataManager,
  getPoint,
  getLocationLabel = () => 'Your location',
  onWeather,
  onTraffic,
  fetchImpl = globalThis.fetch,
}) {
  const doc = shell.ownerDocument;
  const bar = doc.createElement('section');
  bar.className = 'lws-report-banner';
  bar.setAttribute('aria-label', 'Traffic and weather near your current location');
  const track = doc.createElement('div');track.className='lws-report-track';
  const weather = doc.createElement('button');
  const traffic = doc.createElement('button');
  weather.type = traffic.type = 'button';
  weather.textContent = 'Your location · Weather loading…';
  traffic.textContent = 'Traffic · Open reports';
  weather.addEventListener('click', onWeather);
  traffic.addEventListener('click', onTraffic);
  track.append(weather, traffic);bar.append(track);shell.append(bar);
  let request, cell = '', updated = 0, destroyed = false;
  function renderTraffic() { traffic.textContent = trafficReport(dataManager?.getAll?.() || [], getPoint()); }
  async function refresh() {
    renderTraffic();
    const point = getPoint();
    if (!point) return;
    const key = `${point.accuracy != null ? 'device' : 'map'}:${point.lat.toFixed(2)},${point.lon.toFixed(2)}`;
    if (key === cell && Date.now() - updated < 300000) return;
    request?.abort();
    const controller = new AbortController();request = controller;cell = key;updated = Date.now();
    weather.textContent = `${getLocationLabel()} · Weather loading…`;
    try {
      const res = await fetchImpl(`/api/weather-effects?latitude=${point.lat.toFixed(5)}&longitude=${point.lon.toFixed(5)}`, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (destroyed || request !== controller) return;
      const place = getLocationLabel();
      const scope =
        point.accuracy > 10000 ? `${place} area` : place;
      weather.textContent = `${scope} · ${weatherReport(payload)}`;
      weather.title = `Your current location ${key}. Open-Meteo · observation ${payload.weather?.observedAt || 'unknown'}. Click for weather details.`;
    } catch {
      if (!destroyed && request === controller) weather.textContent = 'Weather unavailable · Open details';
    }
  }
  // Reports follow the device location, not wherever the user pans the map.
  // Traffic stays lazy so initial map startup is not blocked by a road query.
  const timer = setInterval(refresh, 30000);
  void refresh();
  return {
    refresh,
    destroy() {
      destroyed = true;
      request?.abort();
      clearInterval(timer);
      bar.remove();
    },
  };
}
