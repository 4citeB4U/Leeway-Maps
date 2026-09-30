// ICAO operating-carrier callsigns, not marketing codeshares or aircraft livery.
const CARRIERS = Object.freeze({
  DAL: ['Delta Air Lines', '#ff7487'],
  UAL: ['United Airlines', '#80bfff'],
  AAL: ['American Airlines', '#c8d8e8'],
  SWA: ['Southwest Airlines', '#ffe05b'],
  NKS: ['Spirit Airlines', '#ffb84d'],
  FFT: ['Frontier Airlines', '#80e59c'],
  JBU: ['JetBlue Airways', '#8fafff'],
  ASA: ['Alaska Airlines', '#77e5d7'],
});
export function airlineIdentity(callsign) {
  const match = String(callsign || '')
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{3})(\d[A-Z0-9]*)$/);
  const carrier = match && CARRIERS[match[1]];
  return carrier
    ? {
        name: carrier[0],
        color: carrier[1],
        basis: 'ICAO callsign',
        code: match[1],
      }
    : null;
}

export function scheduleLabel(schedule, now = Date.now()) {
  if (!schedule || schedule.status !== 'available')
    return 'Flight times unavailable';
  if (now - Date.parse(schedule.retrievedAt) > 5 * 60_000)
    return 'Flight times stale — refresh pending';
  const format = (value) =>
    value
      ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      : 'unavailable';
  return [
    `${schedule.origin || '?'} → ${schedule.destination || '?'} · ${schedule.flightStatus || 'status unavailable'}`,
    `Gate departure scheduled ${format(schedule.scheduledDeparture)}`,
    `Gate arrival scheduled ${format(schedule.scheduledArrival)}`,
    `Landing ${schedule.actualLanding ? 'actual' : 'estimated'} ${format(schedule.actualLanding || schedule.estimatedLanding)}`,
    `FlightAware · checked ${format(schedule.retrievedAt)}`,
  ].join('\n');
}
