export const TRUCK_RESTRICTION_FIELDS = Object.freeze([
  'maxheightM',
  'maxweightKg',
  'maxwidthM',
  'maxlengthM',
  'hgv',
  'access',
]);

export function evaluateTruckRestriction(profile, restriction = {}) {
  const reasons = [];
  if (
    Number.isFinite(restriction.maxheightM) &&
    Number.isFinite(profile?.heightM) &&
    profile.heightM > restriction.maxheightM
  ) {
    reasons.push('HEIGHT_EXCEEDS_LIMIT');
  }
  if (
    Number.isFinite(restriction.maxweightKg) &&
    Number.isFinite(profile?.grossWeightKg) &&
    profile.grossWeightKg > restriction.maxweightKg
  ) {
    reasons.push('WEIGHT_EXCEEDS_LIMIT');
  }
  if (
    Number.isFinite(restriction.maxwidthM) &&
    Number.isFinite(profile?.widthM) &&
    profile.widthM > restriction.maxwidthM
  ) {
    reasons.push('WIDTH_EXCEEDS_LIMIT');
  }
  if (
    Number.isFinite(restriction.maxlengthM) &&
    Number.isFinite(profile?.lengthM) &&
    profile.lengthM > restriction.maxlengthM
  ) {
    reasons.push('LENGTH_EXCEEDS_LIMIT');
  }
  if (['no', 'private'].includes(String(restriction.hgv || '').toLowerCase())) {
    reasons.push('HGV_ACCESS_RESTRICTED');
  }
  if (
    ['no', 'private'].includes(String(restriction.access || '').toLowerCase())
  ) {
    reasons.push('GENERAL_ACCESS_RESTRICTED');
  }
  return {
    pass: reasons.length === 0,
    reasons,
    evidencePresent: TRUCK_RESTRICTION_FIELDS.some(
      (key) => restriction[key] !== undefined && restriction[key] !== null,
    ),
  };
}
export function summarizeTruckRouteSafety(profile, restrictions = []) {
  const checks = (Array.isArray(restrictions) ? restrictions : []).map(
    (restriction) => ({
      restriction,
      result: evaluateTruckRestriction(profile, restriction),
    }),
  );
  const blocked = checks.filter((check) => !check.result.pass);
  const evidenceCount = checks.filter(
    (check) => check.result.evidencePresent,
  ).length;
  if (blocked.length) {
    return {
      status: 'BLOCKED',
      verified: true,
      blockedCount: blocked.length,
      evidenceCount,
      reasons: [...new Set(blocked.flatMap((check) => check.result.reasons))],
    };
  }
  if (!evidenceCount) {
    return {
      status: 'UNVERIFIED',
      verified: false,
      blockedCount: 0,
      evidenceCount: 0,
      reasons: ['NO_TRUCK_RESTRICTION_EVIDENCE'],
    };
  }
  return {
    status: 'NO_CONFLICT_FOUND',
    verified: false,
    blockedCount: 0,
    evidenceCount,
    reasons: ['PARTIAL_RESTRICTION_EVIDENCE_ONLY'],
  };
}
