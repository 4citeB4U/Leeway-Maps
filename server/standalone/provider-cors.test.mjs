import test from 'node:test';
import assert from 'node:assert/strict';
import { providerCorsPlugin } from './provider-cors.js';

function middlewareFor(plugin) {
  let handler;
  plugin.configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  return handler;
}

test('provider CORS allows the LeeWay Pages origin', () => {
  const handler = middlewareFor(providerCorsPlugin());
  const headers = new Map();
  const req = {
    method: 'GET',
    headers: { origin: 'https://4citeb4u.github.io' },
  };
  const res = {
    setHeader(key, value) {
      headers.set(String(key).toLowerCase(), value);
    },
  };
  let nextCalled = false;
  handler(req, res, () => {
    nextCalled = true;
  });
  assert.equal(headers.get('access-control-allow-origin'), 'https://4citeb4u.github.io');
  assert.equal(headers.get('access-control-allow-private-network'), 'true');
  assert.equal(nextCalled, true);
});

test('provider CORS preflight terminates with 204', () => {
  const handler = middlewareFor(providerCorsPlugin());
  const req = {
    method: 'OPTIONS',
    headers: { origin: 'https://4citeb4u.github.io' },
  };
  const headers = new Map();
  let ended = false;
  const res = {
    statusCode: 0,
    setHeader(key, value) {
      headers.set(String(key).toLowerCase(), value);
    },
    end() {
      ended = true;
    },
  };
  handler(req, res, () => {});
  assert.equal(res.statusCode, 204);
  assert.equal(ended, true);
  assert.equal(headers.get('access-control-allow-origin'), 'https://4citeb4u.github.io');
});
