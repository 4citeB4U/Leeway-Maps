/** Driver-facing U.S. distance labels; provider contracts retain SI units. */
export function formatDriverDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return 'Distance unavailable';
  if (meters < 160.9344) return `${Math.round(meters * 3.28084)} ft`;
  return `${(meters / 1609.344).toFixed(1)} mi`;
}
