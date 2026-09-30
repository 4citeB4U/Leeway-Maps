import { publicWorldApiConfig } from './publicApiConfig.js';
function configuredBase() {
  const explicit = String(
    import.meta.env?.VITE_LEEWAY_WORLD_API_URL || '',
  ).trim();
  return publicWorldApiConfig(explicit, globalThis.location?.hostname || '').base;
}

export function worldApiBase() {
  return configuredBase();
}

export function resolveWorldApiUrl(input) {
  const base = configuredBase();
  if (!base) return input;

  const raw =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : String(input || '');

  if (!raw) return input;

  if (raw.startsWith('/api/')) {
    return `${base}${raw}`;
  }

  try {
    const url = new URL(raw, globalThis.location?.href || 'http://localhost/');
    if (
      globalThis.location?.origin &&
      url.origin === globalThis.location.origin &&
      url.pathname.startsWith('/api/')
    ) {
      return `${base}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {}

  return input;
}

export function installWorldApiBridge({
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { installed: false, base: configuredBase() };
  }

  const base = configuredBase();
  if (!base) {
    const state=publicWorldApiConfig(import.meta.env?.VITE_LEEWAY_WORLD_API_URL,globalThis.location?.hostname || '').state;
    if (['missing','invalid'].includes(state) && globalThis.document?.body && !document.getElementById('leeway-api-unavailable')) {
      const notice=document.createElement('div');
      notice.id='leeway-api-unavailable'; notice.setAttribute('role','status');
      notice.style.cssText='position:fixed;bottom:0;left:0;right:0;padding:10px;background:#452b12;color:white;z-index:20000;font:13px system-ui;text-align:center';
      notice.textContent='Live cameras, aircraft and transit are unavailable: the public data service is not configured. Base maps remain available.';
      document.body.appendChild(notice);
    }
    return { installed: false, base: '' };
  }

  if (globalThis.__leewayWorldApiBridge?.installed) {
    return globalThis.__leewayWorldApiBridge;
  }

  const originalFetch = fetchImpl;

  function localRequestInit(init = {}) {
    return {
      ...init,
      // Chromium Local Network Access: mark 127.0.0.1 as an intentional
      // loopback destination so the browser can request the proper permission.
      ...(new URL(base).hostname === '127.0.0.1' ||
      new URL(base).hostname === 'localhost'
        ? { targetAddressSpace: 'loopback' }
        : {}),
    };
  }

  const bridgedFetch = (input, init) => {
    const resolved = resolveWorldApiUrl(input);
    const isBridged =
      typeof resolved === 'string' &&
      resolved !== input &&
      resolved.startsWith(base);

    if (input instanceof Request && typeof resolved === 'string') {
      const request = new Request(resolved, input);
      return originalFetch(request, isBridged ? localRequestInit(init) : init);
    }

    return originalFetch(resolved, isBridged ? localRequestInit(init) : init);
  };

  globalThis.fetch = bridgedFetch;

  const state = {
    installed: true,
    base,
    originalFetch,
    async probe() {
      try {
        const response = await originalFetch(
          `${base}/api/cctv/sources`,
          localRequestInit({
            cache: 'no-store',
          }),
        );
        return {
          ok: response.ok,
          status: response.status,
          base,
        };
      } catch (error) {
        return {
          ok: false,
          status: null,
          base,
          error: String(error?.message || error),
        };
      }
    },
    restore() {
      if (globalThis.fetch === bridgedFetch) {
        globalThis.fetch = originalFetch;
      }
      state.installed = false;
    },
  };

  globalThis.__leewayWorldApiBridge = state;
  return state;
}
