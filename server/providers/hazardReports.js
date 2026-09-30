import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { readRequestBody } from './common/request.js';
import {
  HAZARD_KINDS,
  reportPoint,
  validateReportInput,
  validSharedReport,
} from '../../src/leeway/hazardReportContract.js';

const MAX_REPORTS = 5000;
const MAX_RESULTS = 100;
const digest = (value) => createHash('sha256').update(value).digest();
const failure = (status, message) =>
  Object.assign(new Error(message), { status });

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const sinLat = Math.sin(((b.lat - a.lat) * rad) / 2);
  const sinLon = Math.sin(((b.lon - a.lon) * rad) / 2);
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          sinLat * sinLat +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sinLon * sinLon,
        ),
      ),
    )
  );
}

/** Shared by all clients of this one server process; never seeded with fixtures. */
export function createHazardReportStore({ now = Date.now } = {}) {
  const reports = new Map();
  const prune = () => {
    for (const [id, row] of reports)
      if (row.expiresAt <= now()) reports.delete(id);
  };
  return {
    exportState() {
      prune();
      return { version: 1, reports: [...reports.values()] };
    },
    importState(state) {
      if (
        state?.version !== 1 ||
        !Array.isArray(state.reports) ||
        state.reports.length > MAX_REPORTS ||
        state.reports.some(
          (row) => !validSharedReport(row, Math.min(now(), row?.expiresAt - 1)),
        )
      ) {
        throw failure(503, 'Invalid shared report state.');
      }
      reports.clear();
      for (const row of state.reports) reports.set(row.id, { ...row });
      prune();
    },
    publish(input) {
      const value = validateReportInput(input);
      prune();
      if (reports.size >= MAX_REPORTS)
        throw failure(503, 'Report service at capacity; not published.');
      const createdAt = now();
      const row = {
        ...value,
        id: randomUUID(),
        createdAt,
        expiresAt: createdAt + HAZARD_KINDS[value.kind].ttlMinutes * 60000,
        source: 'community',
        verification: 'unverified',
      };
      reports.set(row.id, row);
      return { ...row };
    },
    nearby(point, radiusKm) {
      prune();
      const matches = [...reports.values()]
        .filter((row) => distanceKm(point, row) <= radiusKm)
        .sort((a, b) => b.createdAt - a.createdAt);
      return {
        reports: matches.slice(0, MAX_RESULTS).map((row) => ({ ...row })),
        truncated: matches.length > MAX_RESULTS,
        fetchedAt: now(),
      };
    },
  };
}

export function createHazardReportsHandler({
  enabled = process.env.LEEWAY_HAZARD_REPORTS_ENABLED === '1',
  writeToken = process.env.LEEWAY_HAZARD_REPORTS_WRITE_TOKEN ?? '',
  store = createHazardReportStore(),
} = {}) {
  const available =
    enabled && typeof writeToken === 'string' && writeToken.length >= 24;
  const expectedToken = digest(available ? writeToken : 'unconfigured');
  const reads = makeRateLimiter({ windowMs: 60000, max: 60, globalMax: 600 });
  const writes = makeRateLimiter({ windowMs: 60000, max: 6, globalMax: 100 });
  return async (req, res) => {
    const send = (status, payload) => {
      if (res.writableEnded || res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(JSON.stringify(payload));
    };
    try {
      if (!reads(clientKey(req)))
        throw failure(429, 'Too many report requests. Try again shortly.');
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET' && url.pathname.endsWith('/status')) {
        return send(200, {
          available,
          source: 'community',
          verification: 'unverified',
          storage: store.durable ? 'redis-ttl' : 'shared-process-ttl',
          durable: store.durable === true,
          writeAuthentication: 'bearer-token',
          message: available
            ? store.durable
              ? 'Shared reports persist across server restarts until expiry.'
              : 'Shared with clients of this server; reports expire and reset on restart.'
            : 'Shared reporting is not configured. Nothing will be broadcast.',
        });
      }
      if (!['/', '/api/hazard-reports'].includes(url.pathname))
        throw failure(404, 'Unknown report endpoint.');
      if (!available)
        throw failure(
          503,
          'Shared reporting is not configured. Nothing was broadcast.',
        );
      if (req.method === 'GET') {
        if (
          !url.searchParams.get('lat')?.trim() ||
          !url.searchParams.get('lon')?.trim()
        )
          throw failure(400, 'Nearby query requires a location.');
        const point = reportPoint({
          lat: Number(url.searchParams.get('lat')),
          lon: Number(url.searchParams.get('lon')),
        });
        const radiusKm = Number(url.searchParams.get('radiusKm') ?? 10);
        if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50)
          throw failure(400, 'Nearby radius must be between 1 and 50 km.');
        return send(200, {
          ...(await store.nearby(point, radiusKm)),
          source: 'community',
          verification: 'unverified',
        });
      }
      if (req.method !== 'POST')
        throw failure(405, 'Use GET or POST for reports.');
      const authorization = String(req.headers.authorization ?? '');
      if (
        authorization.length > 1024 ||
        !authorization.startsWith('Bearer ') ||
        !timingSafeEqual(digest(authorization.slice(7)), expectedToken)
      )
        throw failure(
          401,
          'A valid report-server access token is required. Nothing was broadcast.',
        );
      if (!writes(clientKey(req)))
        throw failure(
          429,
          'Report limit reached. Nothing was broadcast; wait a minute.',
        );
      if (Number(req.headers['content-length']) > 4096)
        throw failure(413, 'Report body too large.');
      const timer = setTimeout(() => {
        send(408, { error: 'Report request timed out; not published.' });
        req.destroy();
      }, 10000);
      let input;
      try {
        input = JSON.parse(await readRequestBody(req, 4096));
      } finally {
        clearTimeout(timer);
      }
      if (res.writableEnded || (req.destroyed && !req.complete)) return;
      const report = await store.publish(input);
      return send(201, {
        published: true,
        report,
        sharedScope: 'clients-of-this-server',
        durable: store.durable === true,
        message:
          'Published to this server. Community observation; not verified.',
      });
    } catch (error) {
      send(error.code === 'BODY_TOO_LARGE' ? 413 : (error.status ?? 400), {
        error:
          error instanceof SyntaxError ? 'Invalid JSON report.' : error.message,
      });
    }
  };
}

export function hazardReportsPlugin(options) {
  const handler = createHazardReportsHandler(options);
  const install = (server) => {
    server.middlewares.use('/api/hazard-reports', handler);
  };
  return {
    name: 'leeway-community-hazard-reports',
    configureServer: install,
    configurePreviewServer: install,
  };
}
