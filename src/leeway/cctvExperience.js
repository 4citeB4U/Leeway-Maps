/*
REGION: LeeWay World / CCTV
TAG: LEEWAY.CCTV.VISIBLE_ENTRY
5WH:
WHAT = Opens the registered CCTV layer and selects a real camera near the current map view.
WHY = An enabled camera layer is not useful evidence unless a camera becomes visible/selectable.
WHO = LeeWay Industries under Creator authority.
WHERE = Browser-side LeeWay map shell.
WHEN = Operator opens CCTV or chooses a media-integrated jurisdiction.
HOW = Enable registered layer, wait for catalog materialization, call the layer-owned focusNearest seam.
LICENSE = MIT, matching this repository.
*/

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openNearestCctv(
  dataManager,
  {
    origin = 'user',
    durationSec = 1.8,
    waitMs = 12_000,
    pollMs = 125,
    sleep = delay,
    now = Date.now,
  } = {},
) {
  const entry = dataManager?.layers?.get?.('cctv');
  if (!entry?.module) {
    return Object.freeze({
      ok: false,
      reason: 'layer-unavailable',
      cameraId: null,
      camera: null,
    });
  }

  if (!dataManager.isEnabled?.('cctv')) {
    await dataManager.setEnabled('cctv', true, { origin });
  }

  const module = entry.module;
  if (
    typeof module.getUIState !== 'function' ||
    typeof module.focusNearest !== 'function'
  ) {
    return Object.freeze({
      ok: false,
      reason: 'camera-interface-unavailable',
      cameraId: null,
      camera: null,
    });
  }

  const started = now();
  let state = module.getUIState();
  while (
    !state?.totalCount &&
    !state?.error &&
    now() - started < Math.max(0, waitMs)
  ) {
    await sleep(Math.max(0, pollMs));
    state = module.getUIState();
  }

  if (state?.error) {
    return Object.freeze({
      ok: false,
      reason: 'catalog-error',
      error: String(state.error),
      cameraId: null,
      camera: null,
    });
  }

  if (!state?.totalCount) {
    return Object.freeze({
      ok: false,
      reason: 'no-cameras',
      cameraId: null,
      camera: null,
    });
  }

  const cameraId = module.focusNearest({
    focus: true,
    durationSec,
  });
  if (!cameraId) {
    return Object.freeze({
      ok: false,
      reason: 'no-camera-in-scope',
      cameraId: null,
      camera: null,
    });
  }

  state = module.getUIState();
  const camera =
    state?.activeCamera ||
    state?.cameras?.find?.((candidate) => candidate.id === cameraId) ||
    null;

  return Object.freeze({
    ok: true,
    reason: null,
    cameraId,
    camera,
    totalCount: Number(state?.totalCount || 0),
    scopedCount: Number(state?.count || 0),
  });
}
