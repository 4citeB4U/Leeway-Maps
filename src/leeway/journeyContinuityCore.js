/*
REGION: LeeWay Maps / Journey Continuity
TAG: LEEWAY.JOURNEY.CONTINUITY.CORE
WHAT = Deterministic timing and connection-state math for multimodal journeys.
WHY = Connections must work without an LLM and must never invent missing ETAs.
WHO = LeeWay Industries under Creator authority.
WHERE = Shared browser-side journey continuity core.
WHEN = A journey has two or more timed legs.
HOW = Compare authoritative timestamps, freshness and required transfer time.
LICENSE = MIT, matching the host repository.
*/

export const JOURNEY_CONNECTION_STATES = Object.freeze(['UNKNOWN','GOOD','WATCH','TIGHT','MISSED']);
export const JOURNEY_TRUTH_STATES = Object.freeze(['LIVE','PREDICTED','SCHEDULED','MAPPED','SIMULATED','STALE','UNAVAILABLE']);

function finiteTime(value) {
  const number = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeTruthState(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return JOURNEY_TRUTH_STATES.includes(normalized) ? normalized : 'UNAVAILABLE';
}

export function assessConnection({
  nowMs = Date.now(),
  inboundArrivalMs,
  outboundDepartureMs,
  minimumTransferMs = 10 * 60_000,
  freshnessAgeMs = null,
  maxFreshnessMs = 2 * 60_000,
  inboundTruth = 'UNAVAILABLE',
  outboundTruth = 'SCHEDULED',
} = {}) {
  const arrival = finiteTime(inboundArrivalMs);
  const departure = finiteTime(outboundDepartureMs);
  const minimum = Number(minimumTransferMs);
  const now = finiteTime(nowMs);
  const freshness = Number(freshnessAgeMs);
  const stale = Number.isFinite(freshness) && Number.isFinite(maxFreshnessMs) && freshness > maxFreshnessMs;
  const truth = Object.freeze({
    inbound: stale ? 'STALE' : normalizeTruthState(inboundTruth),
    outbound: normalizeTruthState(outboundTruth),
  });

  if (arrival === null || departure === null || now === null || !Number.isFinite(minimum) || minimum < 0) {
    return Object.freeze({ state:'UNKNOWN', slackMs:null, availableTransferMs:null, truth, reason:'authoritative-times-required' });
  }

  const availableTransferMs = departure - Math.max(now, arrival);
  const slackMs = availableTransferMs - minimum;
  let state = 'GOOD';
  if (slackMs < 0) state = 'MISSED';
  else if (slackMs < 5 * 60_000) state = 'TIGHT';
  else if (slackMs < 15 * 60_000) state = 'WATCH';

  return Object.freeze({
    state,
    slackMs,
    availableTransferMs,
    truth,
    reason: stale ? 'inbound-live-data-stale' : null,
  });
}

export function formatConnectionAssessment(result) {
  if (!result || result.state === 'UNKNOWN')
    return 'Connection timing unavailable — authoritative arrival and departure times are required.';
  const minutes = Math.round((result.slackMs || 0) / 60_000);
  if (result.state === 'MISSED')
    return 'Connection is at risk of being missed by about ' + Math.abs(minutes) + ' min.';
  if (result.state === 'TIGHT')
    return 'Tight connection — about ' + minutes + ' min beyond the minimum transfer time.';
  if (result.state === 'WATCH')
    return 'Watch this connection — about ' + minutes + ' min of transfer margin.';
  return 'Connection currently has about ' + minutes + ' min of transfer margin.';
}

export function boundsForPoints(points = [], paddingDegrees = 0.02) {
  const valid = points.filter((point) =>
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
  if (!valid.length) return null;
  const lats = valid.map((point) => point.lat);
  const lons = valid.map((point) => point.lon);
  const pad = Math.max(0, Number(paddingDegrees) || 0);
  return Object.freeze({
    west: Math.max(-180, Math.min(...lons) - pad),
    south: Math.max(-90, Math.min(...lats) - pad),
    east: Math.min(180, Math.max(...lons) + pad),
    north: Math.min(90, Math.max(...lats) + pad),
  });
}
