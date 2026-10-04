/*
REGION: LeeWay Maps / Runtime Adaptation
TAG: LEEWAY.RUNTIME.DEVICE_PROFILE
WHAT = Deterministic device/browser capability profile and conservative mobile render policy.
WHY = Mobile maps must remain responsive without assuming an LLM or a specific phone vendor.
WHO = LeeWay Industries under Creator authority.
WHERE = Browser runtime before/after the map shell mounts.
WHEN = App starts or viewport materially changes.
HOW = Inspect standardized browser signals and return bounded policy; never infer unavailable hardware.
LICENSE = MIT, matching the host repository.
*/

export function deviceCapabilityProfile({
  navigatorRef = globalThis.navigator,
  windowRef = globalThis.window,
} = {}) {
  const width = Number(windowRef?.innerWidth || 0);
  const height = Number(windowRef?.innerHeight || 0);
  const dpr = Number(windowRef?.devicePixelRatio || 1);
  const cores = Number(navigatorRef?.hardwareConcurrency || 0);
  const memoryGiB = Number(navigatorRef?.deviceMemory || 0);
  const touch = Number(navigatorRef?.maxTouchPoints || 0);
  const webgpu = Boolean(navigatorRef?.gpu);
  const mobileViewport = width > 0 && width <= 820;
  const constrained =
    mobileViewport &&
    ((memoryGiB > 0 && memoryGiB <= 4) || (cores > 0 && cores <= 4) || dpr >= 3);

  return Object.freeze({
    width,
    height,
    dpr,
    cores: cores || null,
    memoryGiB: memoryGiB || null,
    touchPoints: touch,
    webgpu,
    mobileViewport,
    constrained,
    platform: String(navigatorRef?.platform || ''),
    userAgent: String(navigatorRef?.userAgent || ''),
  });
}

export function mobileRenderPolicy(profile) {
  const p = profile || {};
  if (!p.mobileViewport) {
    return Object.freeze({
      id: 'desktop-balanced',
      resolutionScale: 1,
      aircraft3d: true,
      aircraft3dMode: 'proximity',
      maxUiScale: 1,
    });
  }
  if (p.constrained) {
    return Object.freeze({
      id: 'mobile-constrained',
      resolutionScale: 0.72,
      aircraft3d: false,
      aircraft3dMode: 'proximity',
      maxUiScale: 1.18,
    });
  }
  return Object.freeze({
    id: 'mobile-balanced',
    resolutionScale: 0.85,
    aircraft3d: true,
    aircraft3dMode: 'proximity',
    maxUiScale: 1.12,
  });
}

export function applyMobileRenderPolicy({
  viewer,
  dataManager,
  profile = deviceCapabilityProfile(),
  policy = mobileRenderPolicy(profile),
} = {}) {
  if (viewer && Number.isFinite(policy.resolutionScale)) {
    viewer.resolutionScale = Math.max(0.5, Math.min(1, policy.resolutionScale));
    viewer.scene?.requestRender?.();
  }
  const flights = dataManager?.layers?.get?.('flights')?.module;
  if (flights?.setParams) {
    flights.setParams(
      { models3d: policy.aircraft3d, models3dMode: policy.aircraft3dMode },
      { origin: 'device-policy' },
    );
  }
  return Object.freeze({ profile, policy });
}
