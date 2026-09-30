import { addressText } from './addressStore.js';

/**
 * Reads an address deliberately shared into the installed PWA.  A normal Maps
 * URL stays a URL until we can extract a human-readable address query; bare
 * coordinates are refused by the same address policy as the planner.
 */
export function readIncomingSharedAddress(
  search,
  base = 'https://leeway.invalid/',
) {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const direct = [params.get('sharedText'), params.get('sharedTitle')]
    .filter(Boolean)
    .map((value) => String(value).trim());
  const sharedUrl = String(params.get('sharedUrl') || '').trim();
  if (sharedUrl) {
    try {
      const url = new URL(sharedUrl, base);
      for (const key of ['query', 'q', 'destination', 'daddr']) {
        const value = url.searchParams.get(key)?.trim();
        if (value) direct.unshift(value);
      }
    } catch {
      // A non-URL shared value remains eligible as normal shared text below.
      direct.unshift(sharedUrl);
    }
  }
  for (const value of direct) {
    try {
      return addressText(value);
    } catch {
      // Continue so a title can rescue an opaque Google Maps tracking URL.
    }
  }
  return null;
}

export function clearIncomingSharedAddress(
  locationRef = globalThis.location,
  historyRef = globalThis.history,
) {
  const url = new URL(locationRef.href);
  let changed = false;
  for (const key of ['sharedText', 'sharedTitle', 'sharedUrl']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) historyRef?.replaceState?.(historyRef.state, '', url);
}
