import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRedisState,
  createRedisRest,
  CAS_SCRIPT,
  LIMIT_SCRIPT,
} from './redisState.js';
import { createVercelSharedHandler } from './vercelShared.js';
import { createPeerTicket } from '../providers/peerSignaling.js';

function database() {
  const values = new Map();
  return async ([op, script, , key, previous, next]) => {
    if (op === 'GET') return values.get(script) ?? null;
    if (script === LIMIT_SCRIPT) {
      const value = (values.get(key) || 0) + 1;
      values.set(key, value);
      return value;
    }
    assert.equal(script, CAS_SCRIPT);
    if ((values.get(key) ?? '') !== previous) return 0;
    values.set(key, next);
    return 1;
  };
}
function counter() {
  let n = 0;
  return {
    importState: (state) => {
      n = state;
    },
    exportState: () => n,
    add: () => ++n,
    read: () => n,
  };
}
function response() {
  return {
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = JSON.parse(body);
      this.writableEnded = true;
    },
  };
}
const env = {
  LEEWAY_REDIS_NAMESPACE: 'test',
  LEEWAY_PEER_SIGNALING_ENABLED: '1',
  LEEWAY_PEER_SIGNING_SECRET: 'x'.repeat(40),
  LEEWAY_HAZARD_REPORTS_ENABLED: '1',
  LEEWAY_HAZARD_REPORTS_WRITE_TOKEN: 'y'.repeat(32),
};
async function request(handler, url, method = 'GET', body, token) {
  const res = response();
  await handler(
    {
      url,
      method,
      body,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token || ''}`,
      },
      socket: {},
    },
    res,
  );
  return res;
}
test('CAS concurrent independent invocations retain both writes', async () => {
  const command = database();
  const a = createRedisState({
    command,
    key: 'state',
    createStore: counter,
    ttlSeconds: 60,
  });
  const b = createRedisState({
    command,
    key: 'state',
    createStore: counter,
    ttlSeconds: 60,
  });
  assert.deepEqual((await Promise.all([a('add'), b('add')])).sort(), [1, 2]);
  assert.equal(await b('read', [], true), 2);
});
test('bounded retries fail closed, never return uncommitted mutation', async () => {
  let attempts = 0;
  const state = createRedisState({
    command: async ([op]) => (op === 'GET' ? null : (attempts++, 0)),
    key: 'state',
    createStore: counter,
    ttlSeconds: 60,
  });
  await assert.rejects(state('add'), /busy/);
  assert.equal(attempts, 4);
});
test('corrupt or oversized state does not silently reset', async () => {
  for (const value of ['invalid-json', 'x'.repeat(1025)]) {
    const state = createRedisState({
      command: async () => value,
      key: 'state',
      createStore: counter,
      ttlSeconds: 60,
      maxBytes: 1024,
    });
    await assert.rejects(state('add'), { status: 503 });
  }
});
test('Redis transport refuses missing/insecure configuration and redacts upstream errors', async () => {
  assert.throws(() => createRedisRest({ env: {} }), { status: 503 });
  assert.throws(
    () =>
      createRedisRest({
        env: {
          UPSTASH_REDIS_REST_URL: 'http://redis.test',
          UPSTASH_REDIS_REST_TOKEN: 'secret',
        },
      }),
    { status: 503 },
  );
  const command = createRedisRest({
    env: {
      UPSTASH_REDIS_REST_URL: 'https://redis.test',
      UPSTASH_REDIS_REST_TOKEN: 'secret',
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: 'secret diagnostic' })),
  });
  await assert.rejects(
    command(['GET', 'key']),
    (error) => error.status === 503 && !error.message.includes('secret'),
  );
});
test('Vercel missing Redis fails closed including status and login', async () => {
  const handler = createVercelSharedHandler({ env });
  for (const path of [
    '/api/peers/status',
    '/api/hazard-reports/status',
    '/api/peers/login',
  ])
    assert.equal((await request(handler, path)).status, 503);
});
test('hazard report persists across fresh handler instances and reports durable truthfully', async () => {
  const command = database();
  const first = createVercelSharedHandler({ env, command });
  const result = await request(
    first,
    '/api/hazard-reports',
    'POST',
    { kind: 'crash', lat: 38.9, lon: -77 },
    env.LEEWAY_HAZARD_REPORTS_WRITE_TOKEN,
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.durable, true);
  const second = createVercelSharedHandler({ env, command });
  const nearby = await request(second, '/api/hazard-reports?lat=38.9&lon=-77');
  assert.equal(nearby.status, 200);
  assert.equal(nearby.body.reports[0].id, result.body.report.id);
  assert.equal(
    (await request(second, '/api/hazard-reports/status')).body.storage,
    'redis-ttl',
  );
});
test('peer directory crosses function instances while organization isolation remains enforced', async () => {
  const command = database();
  const ticket = (org) =>
    createPeerTicket(
      { subject: org, org, displayName: org, role: 'driver' },
      env.LEEWAY_PEER_SIGNING_SECRET,
    );
  const first = createVercelSharedHandler({ env, command });
  assert.equal(
    (
      await request(
        first,
        '/api/peers/presence',
        'POST',
        { discoverable: true },
        ticket('one'),
      )
    ).status,
    200,
  );
  const second = createVercelSharedHandler({ env, command });
  const stranger = await request(
    second,
    '/api/peers/directory',
    'GET',
    undefined,
    ticket('two'),
  );
  assert.equal(stranger.status, 200);
  assert.deepEqual(stranger.body.peers, []);
  const colleague = createPeerTicket(
    { subject: 'colleague', org: 'one', displayName: 'Peer', role: 'driver' },
    env.LEEWAY_PEER_SIGNING_SECRET,
  );
  assert.equal(
    (await request(second, '/api/peers/directory', 'GET', undefined, colleague))
      .body.peers[0].id,
    'one',
  );
});
test('distributed login limiter survives fresh handlers', async () => {
  const command = database();
  for (let i = 0; i < 5; i++)
    await request(
      createVercelSharedHandler({ env, command }),
      '/api/peers/login',
      'POST',
      {},
    );
  assert.equal(
    (
      await request(
        createVercelSharedHandler({ env, command }),
        '/api/peers/login',
        'POST',
        {},
      )
    ).status,
    429,
  );
});
test('expired hazard rows are not resurrected by a fresh function', async () => {
  const command = database();
  let time = Date.now();
  const first = createVercelSharedHandler({ env, command, now: () => time });
  assert.equal(
    (
      await request(
        first,
        '/api/hazard-reports',
        'POST',
        { kind: 'police', lat: 38.9, lon: -77 },
        env.LEEWAY_HAZARD_REPORTS_WRITE_TOKEN,
      )
    ).status,
    201,
  );
  time += 31 * 60000;
  const second = createVercelSharedHandler({ env, command, now: () => time });
  assert.deepEqual(
    (await request(second, '/api/hazard-reports?lat=38.9&lon=-77')).body
      .reports,
    [],
  );
});
test('Redis outage never acknowledges publication or leaks backend diagnostics', async () => {
  const handler = createVercelSharedHandler({
    env,
    command: async () => {
      throw new Error('private database endpoint');
    },
  });
  const result = await request(
    handler,
    '/api/hazard-reports',
    'POST',
    { kind: 'crash', lat: 38.9, lon: -77 },
    env.LEEWAY_HAZARD_REPORTS_WRITE_TOKEN,
  );
  assert.equal(result.status, 503);
  assert.equal(result.body.published, undefined);
  assert.ok(!JSON.stringify(result.body).includes('private database'));
});

test('serverless contact blocks survive fresh handlers without a signaling TTL', async () => {
  const inner = database();
  const expiries = [];
  const command = async (args) => {
    if (args[0] === 'EVAL' && args[1] === CAS_SCRIPT) expiries.push(args[6]);
    return inner(args);
  };
  const token = (id) =>
    createPeerTicket(
      { subject: id, org: 'public', displayName: id, role: 'driver' },
      env.LEEWAY_PEER_SIGNING_SECRET,
    );
  const first = createVercelSharedHandler({ env, command });
  await request(
    first,
    '/api/peers/presence',
    'POST',
    { discoverable: true },
    token('a'),
  );
  const block = await request(
    first,
    '/api/peers/block',
    'POST',
    { to: 'a' },
    token('b'),
  );
  assert.equal(block.status, 200);
  const second = createVercelSharedHandler({ env, command });
  assert.equal(
    (await request(second, '/api/peers/blocked', 'GET', undefined, token('b')))
      .body.peers[0].id,
    'a',
  );
  assert.equal(
    (
      await request(
        second,
        '/api/peers/invite',
        'POST',
        { to: 'a', media: 'audio' },
        token('b'),
      )
    ).status,
    404,
  );
  assert.ok(expiries.every((ttl) => ttl === 0));
});
