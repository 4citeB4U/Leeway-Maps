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
