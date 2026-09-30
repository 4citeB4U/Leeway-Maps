import { randomUUID } from 'node:crypto';

const unavailable = () =>
  Object.assign(
    new Error(
      'Shared storage unavailable. Retry later; completion is unconfirmed.',
    ),
    { status: 503 },
  );
export const CAS_SCRIPT = `local current = redis.call('GET', KEYS[1])
if (current or '') ~= ARGV[1] then return 0 end
if tonumber(ARGV[3]) == 0 then redis.call('SET', KEYS[1], ARGV[2])
else redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end
return 1`;
export const LIMIT_SCRIPT = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return n`;

/** Native REST transport: credentials and database URL never enter the client build. */
export function createRedisRest({ env = process.env, fetchImpl = fetch } = {}) {
  const endpoint = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw unavailable();
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !token
  )
    throw unavailable();
  return async (command) => {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw unavailable();
      // Upstash is operator-configured, but cap the response before decoding snapshots.
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            throw unavailable();
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (payload.error || !Object.hasOwn(payload, 'result'))
        throw unavailable();
      return payload.result;
    } catch {
      throw unavailable();
    }
  };
}

/** CAS retries only pure store operations. Never replay external side effects here. */
export function createRedisState({
  command,
  key,
  createStore,
  ttlSeconds,
  maxBytes = 1024 * 1024,
  attempts = 4,
}) {
  return async (method, args = [], readOnly = false) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const previous = await command(['GET', key]);
      if (
        previous !== null &&
        (typeof previous !== 'string' || Buffer.byteLength(previous) > maxBytes)
      )
        throw unavailable();
      const store = createStore();
      if (previous !== null) {
        try {
          const state = JSON.parse(previous);
          if (state.version !== 1 || typeof state.revision !== 'string')
            throw 0;
          store.importState(state.data);
        } catch {
          throw unavailable();
        }
      }
      const result = store[method](...args);
      if (readOnly) return result;
      const next = JSON.stringify({
        version: 1,
        revision: randomUUID(),
        data: store.exportState(),
      });
      if (Buffer.byteLength(next) > maxBytes)
        throw Object.assign(
          new Error('Shared service at capacity. Try later.'),
          { status: 503 },
        );
      // Random revision prevents an expired/recreated key from passing an old compare (ABA).
      if (
        (await command([
          'EVAL',
          CAS_SCRIPT,
          1,
          key,
          previous ?? '',
          next,
          ttlSeconds,
        ])) === 1
      )
        return result;
    }
    throw Object.assign(new Error('Shared service busy. Retry shortly.'), {
      status: 503,
    });
  };
}

export async function enforceRedisLimit(command, key, limit) {
  const count = await command(['EVAL', LIMIT_SCRIPT, 1, key]);
  if (!Number.isInteger(count) || count < 1) throw unavailable();
  if (count > limit)
    throw Object.assign(
      new Error('Shared service request limit reached. Try in a minute.'),
      { status: 429 },
    );
}
