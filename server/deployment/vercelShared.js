import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  createPeerSignalingHandler,
  createPeerSignalingStore,
} from '../providers/peerSignaling.js';
import {
  createHazardReportsHandler,
  createHazardReportStore,
} from '../providers/hazardReports.js';
import {
  createRedisRest,
  createRedisState,
  enforceRedisLimit,
} from './redisState.js';

export function createVercelSharedHandler({
  env = process.env,
  command,
  now = Date.now,
} = {}) {
  let redis, peers, hazards;
  try {
    redis = command || createRedisRest({ env });
    const namespace = env.LEEWAY_REDIS_NAMESPACE;
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace || ''))
      throw new Error('namespace required');
    // Contact blocks must outlive a signaling session; ephemeral rows prune themselves.
    const peerState = createRedisState({
      command: redis,
      key: `${namespace}:peers:v1`,
      createStore: () => createPeerSignalingStore({ now }),
      ttlSeconds: 0,
    });
    const hazardState = createRedisState({
      command: redis,
      key: `${namespace}:hazards:v1`,
      createStore: () => createHazardReportStore({ now }),
      ttlSeconds: 7260,
    });
    peers = createPeerSignalingHandler({
      env: { ...env, VERCEL: '1' },
      now,
      store: {
        act: (user, action, input) =>
          peerState(
            'act',
            [user, action, input],
            ['directory', 'inbox', 'blocked'].includes(action),
          ),
      },
    });
    hazards = createHazardReportsHandler({
      enabled: env.LEEWAY_HAZARD_REPORTS_ENABLED === '1',
      writeToken: env.LEEWAY_HAZARD_REPORTS_WRITE_TOKEN,
      store: {
        durable: true,
        publish: (input) => hazardState('publish', [input]),
        nearby: (...args) => hazardState('nearby', args, true),
      },
    });
  } catch {
    redis = null;
  }
  return async (req, res) => {
    const send = (status, body) => {
      if (res.writableEnded) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'https://local');
      const peer =
        /^\/api\/peers\/(status|login|me|presence|directory|inbox|invite|respond|hangup|signal|blocked|block|unblock|report)$/.test(
          url.pathname,
        );
      const hazard = /^\/api\/hazard-reports(?:\/status)?$/.test(url.pathname);
      if (!peer && !hazard)
        return send(404, { error: 'Unknown shared service endpoint.' });
      if (!redis)
        return send(503, {
          available: false,
          error:
            'Durable shared storage is not configured. Nothing was broadcast.',
        });
      const family = peer ? 'peers' : 'hazards';
      const prefix = `${env.LEEWAY_REDIS_NAMESPACE}:limit:${family}`;
      // Vercel overwrites x-vercel-forwarded-for. No trust in ordinary forwarded-for.
      const address = String(
        req.headers['x-vercel-forwarded-for'] ||
          req.socket?.remoteAddress ||
          'unknown',
      ).slice(0, 256);
      const client = createHash('sha256').update(address).digest('hex');
      await enforceRedisLimit(redis, `${prefix}:global`, peer ? 3000 : 600);
      await enforceRedisLimit(redis, `${prefix}:${client}`, peer ? 240 : 60);
      if (url.pathname.endsWith('/login')) {
        await enforceRedisLimit(redis, `${prefix}:login`, 30);
        await enforceRedisLimit(redis, `${prefix}:login:${client}`, 5);
      } else if (req.method === 'POST') {
        await enforceRedisLimit(redis, `${prefix}:writes`, peer ? 600 : 100);
        await enforceRedisLimit(
          redis,
          `${prefix}:writes:${client}`,
          peer ? 120 : 6,
        );
      }
      if (url.pathname.endsWith('/invite'))
        await enforceRedisLimit(redis, `${prefix}:invites:${client}`, 6);
      // Vercel may eagerly parse JSON before invoking a Node function. Replay a bounded
      // body into the existing raw HTTP handler; never wait for an already-ended stream.
      let request = req;
      if (req.body !== undefined) {
        const body = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              typeof req.body === 'string'
                ? req.body
                : JSON.stringify(req.body),
            );
        if (body.length > (peer ? 32768 : 4096))
          return send(413, { error: 'Request body too large.' });
        request = Readable.from([body]);
        Object.assign(request, {
          url: req.url,
          method: req.method,
          headers: req.headers,
          socket: req.socket,
          complete: true,
        });
      }
      return await (peer ? peers : hazards)(request, res);
    } catch (error) {
      return send(error.status || 503, {
        error: error.status
          ? error.message
          : 'Shared storage unavailable. Completion is unconfirmed; retry later.',
      });
    }
  };
}
