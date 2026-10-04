/** Fixed, bounded public-transport query; callers supply numeric coordinates only. */
export function transitOsmQuery(kind, lat, lon) {
  if (
    !['routes', 'stops'].includes(kind) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    throw new TypeError('Invalid transit area');
  const radius = kind === 'routes' ? 10000 : 3000;
  const around = `(around:${radius},${lat.toFixed(3)},${lon.toFixed(3)})`;
  const dy = radius / 110000,
    dx = Math.min(180, dy / Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const bounds = [
    Math.max(-90, lat - dy),
    Math.max(-180, lon - dx),
    Math.min(90, lat + dy),
    Math.min(180, lon + dx),
  ]
    .map((v) => v.toFixed(4))
    .join(',');
  return kind === 'routes'
    ? `[out:json][timeout:18][maxsize:33554432];relation["type"="route"]["route"~"^(bus|trolleybus|tram|subway|light_rail|train|ferry)$"]${around};out geom(${bounds}) 100;`
    : `[out:json][timeout:18][maxsize:33554432];(node["highway"="bus_stop"]${around};node["railway"~"^(station|halt|tram_stop)$"]${around};node["public_transport"="platform"]${around};);out body 100;`;
}
export function normalizeTransitOsm(kind, payload) {
  if (!Array.isArray(payload?.elements) || payload.remark)
    throw new Error('Incomplete mapped network response');
  const rows = payload.elements.slice(0, 100).map((element) => {
    const tags = element.tags || {};
    const common = {
      id: `osm-${element.type}-${element.id}`,
      agency: { agency_name: tags.operator || tags.network || '' },
      alerts: [],
      mappedOnly: true,
    };
    if (kind === 'stops')
      return {
        ...common,
        stop_name: tags.name || tags.ref || 'Mapped transit stop',
        geometry: { type: 'Point', coordinates: [element.lon, element.lat] },
      };
    const coordinates = [];
    for (const member of element.members || []) {
      if (member.type !== 'way' || !Array.isArray(member.geometry)) continue;
      let line = [];
      for (const point of member.geometry) {
        if (point && Number.isFinite(point.lon) && Number.isFinite(point.lat))
          line.push([point.lon, point.lat]);
        else {
          if (line.length >= 2) coordinates.push(line);
          line = [];
        }
      }
      if (line.length >= 2) coordinates.push(line);
    }
    const joined = [];
    for (const line of coordinates) {
      const previous = joined.at(-1),
        end = previous?.at(-1);
      if (end && end[0] === line[0][0] && end[1] === line[0][1])
        previous.push(...line.slice(1));
      else if (end && end[0] === line.at(-1)[0] && end[1] === line.at(-1)[1])
        previous.push(...line.slice(0, -1).reverse());
      else joined.push(line);
    }
    return {
      ...common,
      route_short_name: tags.ref || '',
      route_long_name: tags.name || tags.route || 'Mapped route',
      route_mode: tags.route || 'unknown',
      route_color: (tags.colour || '').replace(/^#/, ''),
      geometry: { type: 'MultiLineString', coordinates: joined },
    };
  });
  if (kind === 'routes') {
    const priority = {
      train: 0,
      subway: 1,
      light_rail: 2,
      tram: 3,
      ferry: 4,
      trolleybus: 5,
      bus: 6,
      unknown: 7,
    };
    rows.sort(
      (a, b) =>
        (priority[a.route_mode] ?? 7) - (priority[b.route_mode] ?? 7),
    );
  }
  return {
    source:
      '© OpenStreetMap contributors (ODbL) · https://www.openstreetmap.org/copyright',
    kind,
    [kind]: rows,
    retrievedAt: new Date().toISOString(),
    mappedOnly: true,
    partial: rows.length >= 100,
    notice:
      'Community-mapped network; routes can be incomplete or outdated. No timetable, arrival prediction, service alert, or live vehicle is implied.',
  };
}
