const EARTH_M_PER_DEG = 111320;

function segmentDistanceM(a, b) {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180;
  const dx = (b[0] - a[0]) * EARTH_M_PER_DEG * Math.cos(lat);
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG;
  return Math.hypot(dx, dy);
}

export function buildRouteTraversal(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const cumulative = [0];
  let totalM = 0;
  for (let i = 1; i < path.length; i++) {
    totalM += segmentDistanceM(path[i - 1], path[i]);
    cumulative.push(totalM);
  }
  return totalM > 0 ? { path, cumulative, totalM } : null;
}

export function sampleRouteTraversal(traversal, fraction) {
  if (!traversal) return null;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const target = traversal.totalM * f;
  const { path, cumulative } = traversal;
  let i = 1;
  while (i < cumulative.length && cumulative[i] < target) i++;
  if (i >= path.length) {
    const last = path[path.length - 1];
    return { lon: last[0], lat: last[1] };
  }
  const startM = cumulative[i - 1];
  const endM = cumulative[i];
  const local = endM > startM ? (target - startM) / (endM - startM) : 0;
  return {
    lon: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * local,
    lat: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * local,
  };
}


function projectPointToSegment(point, a, b) {
  const lat0 = (point.lat * Math.PI) / 180;
  const sx = EARTH_M_PER_DEG * Math.cos(lat0);
  const sy = EARTH_M_PER_DEG;
  const px = point.lon * sx, py = point.lat * sy;
  const ax = a[0] * sx, ay = a[1] * sy;
  const bx = b[0] * sx, by = b[1] * sy;
  const dx = bx - ax, dy = by - ay;
  const denom = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denom));
  const x = ax + t * dx, y = ay + t * dy;
  return {
    lon: x / sx,
    lat: y / sy,
    t,
    distanceM: Math.hypot(px - x, py - y),
  };
}

function closestOnPath(path, point) {
  let best = null;
  for (let i = 0; i < path.length - 1; i++) {
    const snap = projectPointToSegment(point, path[i], path[i + 1]);
    if (!best || snap.distanceM < best.distanceM)
      best = { ...snap, segmentIndex: i };
  }
  return best;
}

export function slicePathBetween(path, from, to, maxDistanceM = 100) {
  if (!Array.isArray(path) || path.length < 2 || !from || !to) return null;
  const a = closestOnPath(path, from);
  const b = closestOnPath(path, to);
  if (
    !a ||
    !b ||
    a.distanceM > maxDistanceM ||
    b.distanceM > maxDistanceM
  )
    return null;
  const out = [[a.lon, a.lat]];
  if (a.segmentIndex <= b.segmentIndex) {
    for (let i = a.segmentIndex + 1; i <= b.segmentIndex; i++)
      out.push(path[i]);
  } else {
    for (let i = a.segmentIndex; i > b.segmentIndex; i--)
      out.push(path[i]);
  }
  out.push([b.lon, b.lat]);
  return out;
}
