/*
REGION: LeeWay Maps / Journey Continuity
TAG: LEEWAY.JOURNEY.ITINERARY.CORE
WHAT = Deterministic itinerary-leg normalization and stable upsert rules.
WHY = Planned routes and live subjects must bind into one journey without LLM reasoning.
WHO = LeeWay Industries under Creator authority.
WHERE = Shared browser-side journey itinerary core.
WHEN = Route planner or map subject emits new evidence.
HOW = Normalize source-backed state into stable leg records and preserve identity/order.
LICENSE = MIT, matching the host repository.
*/

const TIMED_TRUTH = new Set(['LIVE', 'PREDICTED', 'SCHEDULED']);

function point(value) {
  return Number.isFinite(value?.lat) && Number.isFinite(value?.lon)
    ? { lat: Number(value.lat), lon: Number(value.lon), label: value.label || null }
    : null;
}

export function timedTruthAllowsConnection(value) {
  return TIMED_TRUTH.has(String(value || '').toUpperCase());
}

export function routePlannerLeg(state, nowMs = Date.now()) {
  const route = state?.route;
  const stops = Array.isArray(state?.stops) ? state.stops : [];
  if (!route || !Number.isFinite(route.durationS) || route.durationS < 0 || stops.length < 2)
    return null;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const mode = state.travelMode || route.travelMode || 'car';
  const modeLabel = mode === 'foot' ? 'Walk' : mode === 'bike' ? 'Cycle' : 'Drive';
  return Object.freeze({
    key: 'route-planner:' + mode,
    layerId: 'directions',
    kind: mode,
    label: modeLabel + ': ' + (first?.point?.label || first?.text || 'Start') + ' → ' + (last?.point?.label || last?.text || 'Destination'),
    point: point(first?.point),
    endPoint: point(last?.point),
    departureMs: Number(nowMs),
    arrivalMs: Number(nowMs) + Math.round(route.durationS * 1000),
    truth: 'MAPPED',
    timingAuthority: 'route-model-no-live-traffic',
    source: route.source || null,
    distanceM: Number.isFinite(route.distanceM) ? route.distanceM : null,
    durationS: route.durationS,
  });
}

export function upsertJourneyLeg(legs, incoming, { position = 'append' } = {}) {
  if (!incoming?.key) return Array.isArray(legs) ? [...legs] : [];
  const next = Array.isArray(legs) ? legs.map((leg) => ({ ...leg })) : [];
  const index = next.findIndex((leg) => leg.key === incoming.key);
  if (index >= 0) {
    next[index] = { ...next[index], ...incoming };
    return next;
  }
  if (position === 'prepend') next.unshift({ ...incoming });
  else next.push({ ...incoming });
  return next;
}

export function connectionEvidenceReady(inbound, outbound) {
  return Boolean(
    inbound &&
    outbound &&
    timedTruthAllowsConnection(inbound.truth) &&
    timedTruthAllowsConnection(outbound.truth) &&
    Number.isFinite(inbound.arrivalMs) &&
    Number.isFinite(outbound.departureMs),
  );
}

export function connectionChange(previous, current) {
  if (!current) return null;
  if (!previous) return { meaningful: true, reason: 'initial', state: current.state };
  if (previous.state !== current.state)
    return { meaningful: true, reason: 'state-change', state: current.state };
  const a = Number(previous.slackMs);
  const b = Number(current.slackMs);
  if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) >= 5 * 60_000)
    return { meaningful: true, reason: 'margin-change', state: current.state };
  return { meaningful: false, reason: null, state: current.state };
}

export function normalizeJourneyReference(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function bindLiveEvidenceToPlannedLeg(legs, liveLeg) {
  if (!liveLeg) return Array.isArray(legs) ? [...legs] : [];
  const aliases = new Set(
    [liveLeg.reference, liveLeg.label, ...(liveLeg.aliases || [])]
      .map(normalizeJourneyReference)
      .filter(Boolean),
  );
  if (!aliases.size) return upsertJourneyLeg(legs, liveLeg);
  const next = Array.isArray(legs) ? legs.map((leg) => ({ ...leg })) : [];
  const plannedIndex = next.findIndex((leg) => {
    if (
      leg.kind !== liveLeg.kind &&
      !(['transit','rail','ferry'].includes(leg.kind) &&
        ['vehicles','stops','routes'].includes(liveLeg.kind))
    )
      return false;
    const ref = normalizeJourneyReference(leg.reference || leg.label);
    return ref && aliases.has(ref);
  });
  if (plannedIndex < 0) return upsertJourneyLeg(next, liveLeg);
  const planned = next[plannedIndex];
  const liveHasTimedEvidence =
    Number.isFinite(liveLeg.departureMs) || Number.isFinite(liveLeg.arrivalMs);
  next[plannedIndex] = {
    ...planned,
    ...liveLeg,
    key: planned.key,
    departureMs: Number.isFinite(liveLeg.departureMs)
      ? liveLeg.departureMs
      : planned.departureMs ?? null,
    arrivalMs: Number.isFinite(liveLeg.arrivalMs)
      ? liveLeg.arrivalMs
      : planned.arrivalMs ?? null,
    truth: liveHasTimedEvidence ? liveLeg.truth : planned.truth,
    positionTruth: liveLeg.truth || null,
    plannedDepartureMs: planned.plannedDepartureMs ?? planned.departureMs ?? null,
    plannedArrivalMs: planned.plannedArrivalMs ?? planned.arrivalMs ?? null,
    scheduledDepartureMs: planned.scheduledDepartureMs ?? planned.departureMs ?? null,
    scheduledArrivalMs: planned.scheduledArrivalMs ?? planned.arrivalMs ?? null,
    reference: planned.reference || liveLeg.reference || null,
  };
  return next;
}
