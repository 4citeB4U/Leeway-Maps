// Optional server-only AeroAPI adapter. ADS-B positions do not contain schedules.
// https://www.flightaware.com/commercial/aeroapi/
const iso = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
export function normalizeFlightSchedule(payload, callsign, now = Date.now()) {
  const flights = (
    Array.isArray(payload?.flights) ? payload.flights : []
  ).filter((f) => {
    if (![f.ident, f.ident_icao, f.atc_ident].includes(callsign)) return false;
    const start = Date.parse(
      f.actual_off || f.estimated_out || f.scheduled_out,
    );
    const end = Date.parse(f.actual_on || f.estimated_on || f.scheduled_in);
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= now + 3 * 3600_000 &&
      end >= now - 3600_000
    );
  });
  // Never attach an arbitrary same-number flight from another day/leg.
  if (flights.length !== 1)
    return { status: flights.length ? 'ambiguous' : 'unavailable' };
  const f = flights[0];
  return {
    status: 'available',
    source: 'FlightAware AeroAPI',
    retrievedAt: new Date(now).toISOString(),
    flightId: f.fa_flight_id || null,
    flightStatus: f.status || null,
    origin: f.origin?.code_iata || f.origin?.code || null,
    destination: f.destination?.code_iata || f.destination?.code || null,
    scheduledDeparture: iso(f.scheduled_out),
    estimatedDeparture: iso(f.estimated_out),
    actualDeparture: iso(f.actual_out),
    scheduledArrival: iso(f.scheduled_in),
    estimatedArrival: iso(f.estimated_in),
    actualArrival: iso(f.actual_in),
    estimatedLanding: iso(f.estimated_on),
    actualLanding: iso(f.actual_on),
  };
}

export function createScheduleLookup({
  apiKey = process.env.FLIGHTAWARE_API_KEY,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  return async (callsign) => {
    if (!/^[A-Z]{3}\d[A-Z0-9]{0,4}$/.test(callsign))
      return { status: 'unavailable' };
    if (!apiKey) return { status: 'not-configured' };
    const cached = cache.get(callsign);
    if (cached && now() - cached.at < 120_000) return cached.data;
    if (pending.has(callsign)) return pending.get(callsign);
    const request = (async () => {
      let data;
      try {
        const response = await fetchImpl(
          `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(callsign)}`,
          {
            headers: { 'x-apikey': apiKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          },
        );
        data = response.ok
          ? normalizeFlightSchedule(await response.json(), callsign, now())
          : { status: 'unavailable' };
      } catch {
        data = { status: 'unavailable' };
      }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(callsign, { at: now(), data });
      pending.delete(callsign);
      return data;
    })();
    pending.set(callsign, request);
    return request;
  };
}
