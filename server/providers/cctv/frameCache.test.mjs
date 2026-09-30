import test from 'node:test';
import assert from 'node:assert/strict';
import { createCctvFrameCache } from './frameCache.js';

test('concurrent viewers share one frame fetch; expired frames never mask an outage', async () => {
  let now = 0;
  let calls = 0;
  const get = createCctvFrameCache({ now: () => now, ttlMs: 30 });
  const load = async () => {
    calls++;
    return { ok: true, body: Buffer.from('jpg') };
  };
  const result = await Promise.all([get('a', load), get('a', load)]);
  assert.equal(result[0], result[1]);
  await get('a', load);
  assert.equal(calls, 1);
  now = 31;
  assert.equal(await get('a', async () => null), null);
  await get('a', load);
  assert.equal(calls, 2);
});

test('retained bytes and concurrent unique upstream requests are bounded', async () => {
  const get = createCctvFrameCache({ maxBytes: 3, maxPending: 1 });
  let resolve;
  const first = get(
    'a',
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await Promise.resolve();
  assert.deepEqual(await get('b', async () => null), { busy: true });
  resolve({ ok: true, body: Buffer.from('123') });
  await first;
  await get('b', async () => ({ ok: true, body: Buffer.from('456') }));
  let calls = 0;
  await get('a', async () => {
    calls++;
    return null;
  });
  assert.equal(calls, 1, 'the older frame was evicted');
});
