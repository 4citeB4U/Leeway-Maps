/** Position age is separate from a fresh HTTP response or transponder message. */
export function aircraftPositionStatus(info, { now = Date.now(), stale = false } = {}) {
  const timestamp = info?.positionTimeMs;
  const known = Number.isFinite(timestamp) && timestamp > 0;
  const ageSeconds = known ? Math.max(0, (now - timestamp) / 1000) : null;
  return {
    positionTimeMs: known ? timestamp : null,
    positionAgeSeconds: ageSeconds,
    stale: Boolean(stale || (known && ageSeconds > 60)),
    positionStatus: !known ? 'Position time unavailable' : ageSeconds > 300
      ? 'Last known position · prediction stopped'
      : ageSeconds > 60 ? 'Old position · bounded prediction' : 'Recent position',
  };
}
