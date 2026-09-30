import { Capacitor } from '@capacitor/core';

export function locationError(error) {
  const nativeCode = String(error?.code || '');
  const code = Number.isInteger(error?.code) ? error.code
    : nativeCode === 'OS-PLUG-GLOC-0003' ? 1
      : nativeCode === 'OS-PLUG-GLOC-0010' ? 3 : 2;
  return { code, nativeCode, message: code === 1
    ? 'Location permission was denied. Allow location for this site in browser settings and for this app in device settings, then retry.'
    : code === 3
      ? 'The device did not return a position before the timeout. Check device and browser location services, then retry.'
      : 'The device location provider could not determine a position. Location permission alone does not guarantee a fix. Check device location services and retry.',
  };
}

/** Callback-compatible boundary. Never replaces missing GPS with IP/map coordinates. */
export function createLocationProvider({
  native = Capacitor.isNativePlatform(),
  browser = globalThis.navigator?.geolocation,
  loadNative = () => import('@capacitor/geolocation').then(module => module.Geolocation),
} = {}) {
  if (!native) return browser;
  let pluginPromise;
  const plugin = () => pluginPromise ||= Promise.resolve().then(loadNative).catch(error => {
    pluginPromise = null;
    throw error;
  });
  const watches = new Map();
  let sequence = 0;
  return {
    getCurrentPosition(success, failure = () => {}, options = {}) {
      void plugin().then(api => api.getCurrentPosition(options)).then(success).catch(error => failure(locationError(error)));
    },
    watchPosition(success, failure = () => {}, options = {}) {
      const id = ++sequence;
      const record = { canceled: false, nativeId: null, api: null };
      watches.set(id, record);
      void plugin().then(async api => {
        record.api = api;
        if (record.canceled) return;
        record.nativeId = await api.watchPosition(options, (position, error) => {
          if (record.canceled) return;
          if (error) failure(locationError(error));
          else if (position) success(position);
        });
        if (record.canceled) await api.clearWatch({ id: record.nativeId });
      }).catch(error => { watches.delete(id); if (!record.canceled) failure(locationError(error)); });
      return id;
    },
    clearWatch(id) {
      const record = watches.get(id);
      if (!record) return;
      record.canceled = true; watches.delete(id);
      if (record.nativeId !== null) void record.api.clearWatch({ id: record.nativeId }).catch(() => {});
    },
  };
}

let singleton;
export function getLocationProvider() { return singleton ||= createLocationProvider(); }
