/** Production views never replace unavailable operations with bundled fixtures. */
export function operationalCockpit(payload) {
  const mode = String(payload?.mode || '').toUpperCase();
  if (['LIVE', 'LIVE_HUB', 'PRODUCTION', 'CONNECTED'].includes(mode) &&
      !/demo|training|fixture|synthetic/i.test(JSON.stringify(payload?.provenance || {}))) return payload;
  return { mode: 'NOT CONNECTED', vehicle: null, driver: null, activeLoad: null,
    truckProfile: null, hos: null, documents: null, crm: null, route: null };
}

export function operationalFleet(payload) {
  const mode = String(payload?.leeway?.telemetryMode || payload?.mode || '').toUpperCase();
  return ['LIVE', 'PRODUCTION', 'CONNECTED'].includes(mode) ? payload : { vehicles: [] };
}
