export const HAZARD_KINDS = Object.freeze({
  police: { label: 'Police presence', ttlMinutes: 30 },
  congestion: { label: 'Traffic congestion', ttlMinutes: 30 },
  debris: { label: 'Debris on road', ttlMinutes: 60 },
  crash: { label: 'Crash', ttlMinutes: 60 },
  closure: { label: 'Road closed', ttlMinutes: 120 },
  construction: { label: 'Road construction', ttlMinutes: 120 },
  flooding: { label: 'Road flooding', ttlMinutes: 60 },
  ice: { label: 'Ice on road', ttlMinutes: 60 },
});

export function reportPoint(point) {
  if (
    !Number.isFinite(point?.lat) ||
    Math.abs(point.lat) > 90 ||
    !Number.isFinite(point?.lon) ||
    Math.abs(point.lon) > 180
  ) {
    throw new Error('Choose a valid map location first.');
  }
  // Approximate location, ~110 m north/south. Never retain the original GPS fix.
  return {
    lat: Math.round(point.lat * 1000) / 1000,
    lon: Math.round(point.lon * 1000) / 1000,
  };
}

export function validateReportInput(value) {
  if (
    !value ||
    !Object.hasOwn(HAZARD_KINDS, value.kind) ||
    Object.keys(value).some((key) => !['kind', 'lat', 'lon'].includes(key))
  ) {
    throw new Error(
      'Choose a supported report type; free text and identities are not accepted.',
    );
  }
  return { kind: value.kind, ...reportPoint(value) };
}

export function validSharedReport(row, now = Date.now()) {
  try {
    reportPoint(row);
  } catch {
    return false;
  }
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    row.id.length <= 80 &&
    Object.hasOwn(HAZARD_KINDS, row.kind) &&
    row.source === 'community' &&
    row.verification === 'unverified' &&
    Number.isFinite(row.createdAt) &&
    Number.isFinite(row.expiresAt) &&
    row.expiresAt > now &&
    row.createdAt <= now + 60000 &&
    row.expiresAt > row.createdAt &&
    row.expiresAt - row.createdAt <= 120 * 60000
  );
}
