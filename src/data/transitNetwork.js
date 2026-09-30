export const TRANSIT_CITIES = Object.freeze([
  { name: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { name: 'Milwaukee', lat: 43.0389, lon: -87.9065 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
]);
export const escapeTransitText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ],
  );
export function transitGeometryLines(geometry) {
  const lines =
    geometry?.type === 'LineString'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
  return (Array.isArray(lines) ? lines : []).filter(
    (line) =>
      Array.isArray(line) &&
      line.length >= 2 &&
      line.length <= 50000 &&
      line.every(
        (p) =>
          Array.isArray(p) &&
          Number.isFinite(p[0]) &&
          Number.isFinite(p[1]) &&
          Math.abs(p[0]) <= 180 &&
          Math.abs(p[1]) <= 90,
      ),
  );
}
export function transitAlertText(alerts = []) {
  return alerts
    .slice(0, 10)
    .map((a) =>
      (a.header_text || [])
        .map((t) => t.text)
        .filter(Boolean)
        .join(' / '),
    )
    .filter(Boolean)
    .join('\n');
}
/** Keep schedule text, service date, and real-time fields distinct. Never infer ETA from a GPS fix. */
export function transitDepartureText(stops = []) {
  const rows = stops.flatMap((stop) =>
    (stop.departures || []).map((d) => {
      const route = d.trip?.route || {};
      const event = d.departure || d.arrival || {};
      const realtime =
        d.schedule_relationship === 'STATIC' ||
        d.schedule_relationship === 'NO_DATA'
          ? null
          : event.estimated_local || event.estimated_utc || null;
      const delay = Number.isFinite(event.delay)
        ? `; delay ${event.delay}s`
        : '';
      const destination = d.stop_headsign || d.trip?.trip_headsign || '';
      return `${route.route_short_name || route.route_long_name || d.trip?.trip_id || 'Service'} ${destination} — ${d.date || d.service_date || ''} scheduled ${d.departure_time || d.arrival_time || 'unavailable'}; ${realtime ? `estimated ${realtime}` : 'live estimate unavailable'}${delay}; ${d.schedule_relationship || 'STATIC'}`;
    }),
  );
  return rows.length
    ? rows.join('\n')
    : 'No departures supplied for the next hour. Check the operator for current service.';
}
