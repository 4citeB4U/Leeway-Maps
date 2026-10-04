import { openSkyProxy } from '../providers/aircraft/opensky.js';
import { leewayEcosystemProxy } from '../providers/leeway-ecosystem.js';
import { adsbLolProxy } from '../providers/aircraft/adsb-lol.js';
import { adsbdbProxy } from '../providers/aircraft/enrichment.js';
import { trackBackfillProxies } from '../providers/aircraft/tracks.js';
import { cctvProxy } from '../providers/cctv.js';
import { defaultSourceRoot } from '../providers/common/source-root.js';
import { transitProxy } from '../providers/transit.js';
import { transitMapMatchProxy } from '../providers/transit-map-match.js';
import { weatherProxy } from '../providers/weather.js';
import { celestrakProxy, rocketLaunchesProxy } from '../providers/space.js';
import { tomtomProxy } from '../providers/traffic.js';
import { firmsProxy } from '../providers/firms.js';
import { terrainHeightsProxy } from '../providers/terrain.js';
import { overpassProxy } from '../providers/overpass.js';
import { militaryInstallationsProxy } from '../providers/military-installations.js';
import { regionalBriefProxy } from '../providers/regional/briefing.js';
import { geocodeProxy } from '../providers/regional/place.js';
import { weatherEffectsProxy } from '../providers/regional/weather-effects.js';
import { radioBrowserProxy } from '../providers/radio.js';
import { gbfsProxy } from '../providers/gbfs.js';
import { googlePlacesContextProxy } from '../providers/places.js';
import { streetViewProxy } from '../providers/streetview.js';
import { windProxy } from '../providers/wind.js';
import { cycloneProxy } from '../providers/cyclones.js';
import { firePerimetersProxy } from '../providers/firePerimeters.js';
import { createVercelSharedHandler } from './vercelShared.js';

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://4citeb4u.github.io',
  'https://localhost', // Packaged Android WebView, public map API only.
  'capacitor://localhost', // Packaged iOS WebView, public map API only.
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

function pathnameOf(value) {
  return new URL(String(value || '/'), 'https://leeway.invalid').pathname;
}

export function restoreVercelApiPath(value, query = {}) {
  try {
    const url = new URL(String(value || '/'), 'https://leeway.invalid');
    const routed = url.searchParams.get('__leeway_path') ?? query.__leeway_path;
    // Preserve the original pathname when Vercel already provides it. Internal
    // query parameters cannot redirect a normal incoming route to another API.
    if (
      url.pathname === '/api/world' &&
      typeof routed === 'string' &&
      routed &&
      !routed.startsWith('/') &&
      !/[\r\n?#]/.test(routed)
    ) {
      url.pathname = `/api/${routed}`;
    }
    url.searchParams.delete('__leeway_path');
    return url.pathname + url.search;
  } catch {
    return value; // The main handler returns its tested 400 response.
  }
}

function mountMatches(pathname, mount) {
  return pathname === mount || pathname.startsWith(`${mount}/`);
}

function strippedUrl(value, mount) {
  const incoming = new URL(String(value || '/'), 'https://leeway.invalid');
  const pathname = incoming.pathname.slice(mount.length) || '/';
  return `${pathname}${incoming.search}`;
}

export function createMiddlewareRouter() {
  const stack = [];
  const middlewares = {
    use(path, handler) {
      if (typeof path === 'function') {
        stack.push({ mount: null, handler: path });
        return;
      }
      if (typeof handler !== 'function')
        throw new TypeError('middleware handler required');
      const mount = String(path || '').replace(/\/$/, '');
      if (!mount.startsWith('/'))
        throw new TypeError('middleware path required');
      stack.push({ mount, handler });
    },
  };

  async function handle(req, res) {
    const originalUrl = req.url || '/';
    let index = 0;
    async function dispatch(error) {
      if (error) throw error;
      if (res.writableEnded) return true;
      while (index < stack.length) {
        const row = stack[index++];
        const pathname = pathnameOf(req.url);
        if (row.mount && !mountMatches(pathname, row.mount)) continue;
        const priorUrl = req.url;
        if (row.mount) req.url = strippedUrl(priorUrl, row.mount);
        let nextPromise = null;
        const next = (nextError) => {
          // Connect restores the full URL before matching the next mount.
          req.url = priorUrl;
          nextPromise = dispatch(nextError);
          return nextPromise;
        };
        try {
          await row.handler(req, res, next);
          if (nextPromise) await nextPromise;
        } finally {
          req.url = priorUrl;
        }
        return res.writableEnded;
      }
      return false;
    }
    try {
      return await dispatch();
    } finally {
      req.url = originalUrl;
    }
  }

  return { middlewares, handle, size: () => stack.length };
}

function allowedOrigins(env) {
  const configured = String(env.LEEWAY_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function applyCors(req, res, env) {
  const origin = String(req.headers?.origin || '');
  const allowed = allowedOrigins(env);
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,Range',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Range,Accept-Ranges,X-CCTV-Source,X-OpenSky-Auth,X-OpenSky-Cache,X-Flight-Source',
    );
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  return { origin, allowed: !origin || allowed.has(origin) };
}

export function createWorldPlugins({ sourceRoot = defaultSourceRoot } = {}) {
  return [
    openSkyProxy(),
    adsbLolProxy(),
    adsbdbProxy(),
    trackBackfillProxies(),
    cctvProxy({ sourceRoot, statelessMedia: true }),
    weatherProxy(),
    transitProxy(),
    transitMapMatchProxy(),
    celestrakProxy(),
    rocketLaunchesProxy(),
    tomtomProxy(),
    firmsProxy(),
    terrainHeightsProxy(),
    overpassProxy(), // Includes bounded, read-only /api/route.
    militaryInstallationsProxy(),
    regionalBriefProxy(),
    geocodeProxy(),
    weatherEffectsProxy(),
    radioBrowserProxy(),
    gbfsProxy(),
    googlePlacesContextProxy({
      fetchImpl: (url, options = {}) =>
        fetch(url, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(12_000)])
            : AbortSignal.timeout(12_000),
        }),
    }),
    streetViewProxy(),
    windProxy({ timeoutMs: 40_000 }),
    cycloneProxy(),
    firePerimetersProxy(),
    leewayEcosystemProxy(),
  ];
}

/** Guard legacy middleware that finishes after the function's response deadline.
 * Upstream adapters retain their own fetch aborts; this deadline bounds the
 * response, not a guarantee that all legacy background work was cancelled.
 */
async function withinResponseDeadline(run, res, timeoutMs) {
  let expired = false;
  let timer;
  const guarded = new Proxy(res, {
    get(target, key) {
      if (['writeHead', 'setHeader', 'end', 'write'].includes(key)) {
        return (...args) => (expired ? undefined : target[key](...args));
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, key, value) {
      if (!expired) Reflect.set(target, key, value, target);
      return true;
    },
  });
  try {
    return await Promise.race([
      run(guarded),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          if (!res.writableEnded) {
            if (res.headersSent) res.destroy?.();
            else
              json(
                res,
                504,
                { error: 'Provider deadline exceeded; retry shortly.' },
                { 'Retry-After': '5' },
              );
          }
          expired = true;
          resolve(true);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function installPlugins(router, plugins) {
  const server = { middlewares: router.middlewares, httpServer: null };
  for (const plugin of plugins) {
    if (typeof plugin?.configureServer === 'function')
      plugin.configureServer(server);
  }
}

function json(res, status, body, extra = {}) {
  if (res.writableEnded) return;
  // Streaming failures cannot replace an already-started media response with
  // JSON headers. Close that stream so its caller can retry instead.
  if (res.headersSent) {
    res.destroy?.();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

export function createVercelWorldHandler({
  env = process.env,
  plugins = createWorldPlugins(),
  sharedHandler = createVercelSharedHandler({ env }),
  responseTimeoutMs = 55_000,
} = {}) {
  const router = createMiddlewareRouter();
  installPlugins(router, plugins);
  const providerNames = plugins.map((plugin) => plugin?.name).filter(Boolean);

  return async function vercelWorldHandler(req, res) {
    const cors = applyCors(req, res, env);
    if (req.method === 'OPTIONS') {
      if (!cors.allowed) return json(res, 403, { error: 'origin_not_allowed' });
      res.statusCode = 204;
      res.end();
      return;
    }

    let pathname;
    try {
      pathname = pathnameOf(req.url);
    } catch {
      return json(res, 400, { error: 'Invalid request URL.' });
    }
    if (pathname === '/api/health' || pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'leeway-world-runtime',
        providerCount: providerNames.length,
        providers: providerNames,
      });
    }

    if (
      pathname.startsWith('/api/peers/') ||
      pathname === '/api/hazard-reports' ||
      pathname === '/api/hazard-reports/status'
    ) {
      return sharedHandler(req, res);
    }

    // Shared write APIs above keep their own authentication and validation.
    // Public providers expose reads, Overpass read queries, and HLS lease release.
    const publicMethod =
      req.method === 'GET' ||
      (req.method === 'POST' &&
        (pathname === '/api/overpass' ||
          pathname === '/api/transit/map-match')) ||
      (req.method === 'DELETE' && /^\/api\/cctv\/media\/[^/]+$/.test(pathname));
    if (!publicMethod) return json(res, 405, { error: 'Method not allowed.' });
    if (pathname === '/api/ais-live' || pathname.startsWith('/api/ais-live/')) {
      return json(res, 503, {
        error:
          'AIS requires a persistent public collector; this serverless runtime cannot maintain the upstream socket.',
      });
    }
    if (pathname === '/api/terrain/heights') {
      const count = (
        new URL(req.url, 'https://leeway.invalid').searchParams.get('points') ||
        ''
      )
        .split(';')
        .filter(Boolean).length;
      if (count > 64)
        return json(res, 413, {
          error:
            'Batch terrain requests into at most 64 points on this runtime.',
          maxPoints: 64,
        });
    }

    try {
      const handled = await withinResponseDeadline(
        (guarded) => router.handle(req, guarded),
        res,
        Math.max(1, Math.min(55_000, responseTimeoutMs)),
      );
      if (!handled && !res.writableEnded)
        return json(res, 404, { error: 'Unknown LeeWay World endpoint.' });
    } catch (error) {
      console.error('[LeeWay World Runtime] provider request failed');
      return json(res, 503, { error: 'LeeWay World provider unavailable.' });
    }
  };
}
