import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile, access } from 'node:fs/promises';
import { posix } from 'node:path';
import {
  createMiddlewareRouter,
  createVercelWorldHandler,
  createWorldPlugins,
} from './vercelWorld.js';

function response() {
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.writableEnded = false;
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.writeHead = (status, headers = {}) => {
    res.statusCode = status;
    for (const [key, value] of Object.entries(headers))
      res.setHeader(key, value);
  };
  res.end = (body = '') => {
    res.body = String(body ?? '');
    res.writableEnded = true;
  };
  return res;
}

test('Vercel bundles dynamic public CCTV catalogs, heights and weather WASM without private files', async () => {
  const root = new URL('../../', import.meta.url);
  const config = JSON.parse(
    await readFile(new URL('vercel.json', root), 'utf8'),
  );
  const rule = config.functions['api/*.js'];
  assert.equal(rule.maxDuration, 60);
  for (const file of [
    'config/cctv_sources.austin.json',
    'config/cctv_sources.tallinn.json',
    'config/cctv_sources.warendorf.json',
    'src/data/local_data/cctv_ground_heights/cctv_ground_heights.json',
    'node_modules/@meri-imperiumi/eccodes-wasm/build/eccodes/eccodes.wasm',
  ]) {
    assert.equal(posix.matchesGlob(file, rule.includeFiles), true, file);
    await access(new URL(file, root));
  }
  for (const file of [
    '.env',
    '.env.local',
    '.gev-cache/private.json',
    'config/peer-users.json',
  ]) {
    assert.equal(posix.matchesGlob(file, rule.includeFiles), false, file);
  }
});

test('router strips a mount prefix and restores the request URL', async () => {
  const router = createMiddlewareRouter();
  let seen = null;
  router.middlewares.use('/api/cctv', (req, res) => {
    seen = req.url;
    res.end('ok');
  });
  const req = { url: '/api/cctv/sources?city=milwaukee' };
  const res = response();
  assert.equal(await router.handle(req, res), true);
  assert.equal(seen, '/sources?city=milwaukee');
  assert.equal(req.url, '/api/cctv/sources?city=milwaukee');
});

test('world handler exposes health and GitHub Pages CORS', async () => {
  const handler = createVercelWorldHandler({
    env: {},
    plugins: [{ name: 'proof-provider', configureServer() {} }],
    sharedHandler() {
      throw new Error('shared handler should not run');
    },
  });
  const req = {
    method: 'GET',
    url: '/api/health',
    headers: { origin: 'https://4citeb4u.github.io' },
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(
    res.headers['access-control-allow-origin'],
    'https://4citeb4u.github.io',
  );
  assert.deepEqual(JSON.parse(res.body).providers, ['proof-provider']);
});

test('world handler dispatches provider middleware', async () => {
  const plugin = {
    name: 'camera-proof',
    configureServer(server) {
      server.middlewares.use('/api/cctv', (req, res) => {
        assert.equal(req.url, '/sources');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sources: [{ id: 'proof-1' }] }));
      });
    },
  };
  const handler = createVercelWorldHandler({
    env: {},
    plugins: [plugin],
    sharedHandler() {
      throw new Error('shared handler should not run');
    },
  });
  const req = { method: 'GET', url: '/api/cctv/sources', headers: {} };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).sources[0].id, 'proof-1');
});

test('unknown provider route returns a truthful 404', async () => {
  const handler = createVercelWorldHandler({
    env: {},
    plugins: [],
    sharedHandler() {},
  });
  const res = response();
  await handler({ method: 'GET', url: '/api/nope', headers: {} }, res);
  assert.equal(res.statusCode, 404);
});

test('malformed absolute request URL returns 400 without throwing', async () => {
  const handler = createVercelWorldHandler({ plugins: [], sharedHandler() {} });
  const res = response();
  await handler({ method: 'GET', headers: {}, url: 'http://[' }, res);
  assert.equal(res.statusCode, 400);
});

test('a provider failure after streaming starts closes the stream instead of writing JSON headers', async () => {
  const handler = createVercelWorldHandler({
    plugins: [
      {
        name: 'stream',
        configureServer(server) {
          server.middlewares.use('/api/stream', (_req, res) => {
            res.headersSent = true;
            throw new Error('stream failed');
          });
        },
      },
    ],
    sharedHandler() {},
  });
  const res = response();
  let destroyed = false;
  res.destroy = () => {
    destroyed = true;
  };
  await handler({ method: 'GET', headers: {}, url: '/api/stream' }, res);
  assert.equal(destroyed, true);
  assert.equal(res.body, undefined);
});

test('mounted next restores the full path before matching another provider', async () => {
  const router = createMiddlewareRouter();
  router.middlewares.use('/api', (_req, _res, next) => next());
  router.middlewares.use('/api/geocode', (req, res) => {
    assert.equal(req.url, '/?q=test');
    res.end('found');
  });
  const res = response();
  assert.equal(await router.handle({ url: '/api/geocode?q=test' }, res), true);
  assert.equal(res.body, 'found');
});

test('production provider inventory includes map data without private host adapters', () => {
  const plugins = createWorldPlugins();
  const names = plugins.map((plugin) => plugin.name).join(' ');
  for (const provider of [
    'geocode',
    'overpass',
    'regional-brief',
    'weather-effects',
    'terrain-heights',
    'tomtom',
    'firms',
    'gbfs',
    'radio',
    'wind',
    'cyclone',
    'fire-perimeters',
  ]) {
    assert.ok(names.includes(provider), provider);
  }
  assert.doesNotMatch(
    names,
    /key-setup|local-receivers|agent-lee-voice|realtime|leeway-transit|driver-cockpit/,
  );
});

test('public method gate preserves authenticated shared requests and HLS lease release', async () => {
  const paths = [];
  const handler = createVercelWorldHandler({
    env: {},
    sharedHandler(req, res) {
      paths.push('shared:' + req.url);
      res.end('protected');
    },
    plugins: [
      {
        name: 'test',
        configureServer(server) {
          server.middlewares.use((req, res) => {
            paths.push(req.url);
            res.end('public');
          });
        },
      },
    ],
  });
  for (const [method, url, status] of [
    ['POST', '/api/setup/keys', 405],
    ['POST', '/api/voice/token', 405],
    ['POST', '/api/overpass', 200],
    ['DELETE', '/api/cctv/media/camera', 200],
    ['POST', '/api/hazard-reports', 200],
    ['POST', '/api/peers/session', 200],
  ]) {
    const res = response();
    await handler({ method, url, headers: {} }, res);
    assert.equal(res.statusCode, status, method + ' ' + url);
  }
  assert.deepEqual(paths, [
    '/api/overpass',
    '/api/cctv/media/camera',
    'shared:/api/hazard-reports',
    'shared:/api/peers/session',
  ]);
});

test('serverless terrain limit and persistent AIS limitation are explicit', async () => {
  const handler = createVercelWorldHandler({
    env: {},
    plugins: [],
    sharedHandler() {},
  });
  const res = response();
  await handler(
    {
      method: 'GET',
      headers: {},
      url: '/api/terrain/heights?points=' + Array(65).fill('1,2').join(';'),
    },
    res,
  );
  assert.equal(res.statusCode, 413);
  assert.equal(JSON.parse(res.body).maxPoints, 64);
  const ais = response();
  await handler({ method: 'GET', headers: {}, url: '/api/ais-live' }, ais);
  assert.equal(ais.statusCode, 503);
  assert.match(JSON.parse(ais.body).error, /persistent public collector/);
});

test('stalled middleware gets a truthful response before the function deadline; late output is ignored', async () => {
  let finish;
  const handler = createVercelWorldHandler({
    env: {},
    responseTimeoutMs: 5,
    sharedHandler() {},
    plugins: [
      {
        name: 'slow',
        configureServer(server) {
          server.middlewares.use('/api/slow', async (_req, res) => {
            await new Promise((resolve) => {
              finish = resolve;
            });
            res.writeHead(200);
            res.end('late result');
          });
        },
      },
    ],
  });
  const res = response();
  await handler({ method: 'GET', headers: {}, url: '/api/slow' }, res);
  assert.equal(res.statusCode, 504);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(res.statusCode, 504);
  assert.match(res.body, /deadline/);
});

test('real public handlers answer validation and status routes instead of 404', async () => {
  const handler = createVercelWorldHandler();
  for (const url of [
    '/api/tomtom/status',
    '/api/firms/status',
    '/api/gbfs/not-a-url',
    '/api/wind/invalid',
  ]) {
    const req = new EventEmitter();
    Object.assign(req, { method: 'GET', url, headers: {} });
    const res = response();
    await handler(req, res);
    // Wind owns its own not-found error; no generic World endpoint fallthrough.
    assert.doesNotMatch(res.body, /Unknown LeeWay World endpoint/);
  }
});
