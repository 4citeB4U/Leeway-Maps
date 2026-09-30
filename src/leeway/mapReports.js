import { weatherCodeLabel } from '../data/regionalModel.js';

export function weatherReport(payload, now = Date.now()) {
  const w = payload?.weather;
  if (!w || !Number.isFinite(w.temperatureC)) return 'Weather unavailable';
  const stale = payload.status === 'stale' || !Number.isFinite(Date.parse(w.observedAt)) || now - Date.parse(w.observedAt) > 3600000;
  return `${stale ? 'Older weather · ' : ''}${Math.round(w.temperatureC * 9 / 5 + 32)}°F · ${weatherCodeLabel(w.weatherCode)}${Number.isFinite(w.windKph) ? ` · Wind ${Math.round(w.windKph / 1.609)} mph` : ''}`;
}

export function trafficReport(rows, point) {
  const incident = rows.find(r => r.id === 'traffic-incidents');
  if (point?.lon < -91.6 || point?.lon > -87.4 || point?.lat < 36.9 || point?.lat > 42.6) return 'Traffic · Local incident coverage unavailable';
  if (!incident?.enabled) return 'Traffic · Open reports';
  if (incident.stats?.loading) return 'Traffic · Loading reports';
  if (incident.stats?.stale || incident.stats?.error) return 'Traffic · Source unavailable or outdated';
  return 'Traffic · Read Illinois reports';
}

/** Viewport reports never claim that the viewport is the user's GPS position. */
export function mountMapReports({ shell, viewer, dataManager, getPoint, onWeather, onTraffic, fetchImpl = globalThis.fetch }) {
  const doc = shell.ownerDocument;
  const bar = doc.createElement('section');
  bar.className = 'lws-report-banner';
  bar.setAttribute('aria-label', 'Traffic and weather for the map area');
  const track = doc.createElement('div');track.className='lws-report-track';
  const weather = doc.createElement('button');
  const traffic = doc.createElement('button');
  weather.type = traffic.type = 'button';
  weather.textContent = 'Weather · Loading map area…';
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
    const key = `${point.lat.toFixed(2)},${point.lon.toFixed(2)}`;
    if (key === cell && Date.now() - updated < 300000) return;
    request?.abort();
    const controller = new AbortController();request = controller;cell = key;updated = Date.now();
    weather.textContent = 'Weather · Loading map area…';
    try {
      const res = await fetchImpl(`/api/weather-effects?latitude=${point.lat.toFixed(5)}&longitude=${point.lon.toFixed(5)}`, {signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (destroyed || request !== controller) return;
      weather.textContent = `${point.accuracy != null ? 'YOUR LOCATION' : 'MAP AREA'} · ${weatherReport(payload)}`;
      weather.title = `Map area ${key}. Open-Meteo · observation ${payload.weather?.observedAt || 'unknown'}. Click for weather details.`;
    } catch {
      if (!destroyed && request === controller) weather.textContent = 'Weather unavailable · Open details';
    }
  }
  const remove = viewer?.camera?.moveEnd?.addEventListener?.(refresh);
  // The report runner subscribes without a model or an extra layer-menu click.
  if (dataManager?.layers?.has('traffic-incidents')) {
    Promise.resolve(dataManager.setEnabled('traffic-incidents', true, {origin:'automatic-local-reports'})).then(renderTraffic).catch(renderTraffic);
  }
  const timer = setInterval(refresh, 30000);
  void refresh();
  return {refresh,destroy(){destroyed=true;request?.abort();remove?.();clearInterval(timer);bar.remove();}};
}
