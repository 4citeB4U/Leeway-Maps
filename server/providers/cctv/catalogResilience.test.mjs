import test from 'node:test';
import assert from 'node:assert/strict';
import { createCctvCatalog } from './catalog.js';

test('a cold instance resolves a known frame ID with only its official provider and shares lookups', async () => {
  let selectedCalls = 0;
  let unrelatedCalls = 0;
  const get = createCctvCatalog({
    sourceRoot: '/nonexistent-cctv-test',
    livePacks: [
      {
        name: 'nyc-dot',
        enabled: () => true,
        load: async () => {
          selectedCalls++;
          return [
            {
              id: 'nyc-dot-proof',
              snapshotUrl: 'https://webcams.nyctmc.org/api/cameras/proof/image',
              lat: 40.7,
              lon: -74,
            },
          ];
        },
      },
      {
        name: 'tfl',
        enabled: () => true,
        load: async () => {
          unrelatedCalls++;
          throw new Error('unrelated catalog');
        },
      },
    ],
  });
  const [a, b] = await Promise.all([
    get.resolve('nyc-dot-proof'),
    get.resolve('nyc-dot-proof'),
  ]);
  assert.equal(a.id, 'nyc-dot-proof');
  assert.equal(b.id, a.id);
  assert.equal(selectedCalls, 1);
  assert.equal(unrelatedCalls, 0);
  assert.equal(await get.resolve('nyc-dot-not-registered'), null);
  assert.equal(await get.resolve('https://127.0.0.1/private'), null);
  assert.equal(selectedCalls, 1);
});

test('cold frame lookup respects a disabled pack', async () => {
  const get = createCctvCatalog({
    sourceRoot: '/nonexistent-cctv-test',
    livePacks: [
      {
        name: 'nyc-dot',
        enabled: () => false,
        load: async () => {
          throw new Error('must not fetch');
        },
      },
    ],
  });
  assert.equal(await get.resolve('nyc-dot-proof'), null);
});

test('a failed pack retains bounded stale locations while another remains healthy', async () => {
  let clock = 100;
  let fail = false;
  let enabled = true;
  const get = createCctvCatalog({
    sourceRoot: '/nonexistent-cctv-test',
    now: () => clock,
    cacheMs: 10,
    staleMs: 100,
    livePacks: [
      {
        name: 'a',
        enabled: () => enabled,
        load: async () => (fail ? [] : [{ id: 'a', lat: 1, lon: 2 }]),
      },
      {
        name: 'b',
        enabled: () => true,
        load: async () => [{ id: 'b', lat: 3, lon: 4 }],
      },
    ],
  });
  assert.equal((await get()).length, 2);
  clock += 11;
  fail = true;
  const partial = await get();
  assert.equal(partial.length, 2);
  assert.equal(partial.find((x) => x.id === 'a').catalogStatus, 'stale');
  assert.equal(partial.find((x) => x.id === 'b').catalogStatus, 'ready');
  assert.equal(get.status().length, 2);
  clock += 101;
  assert.deepEqual(
    (await get()).map((x) => x.id),
    ['b'],
  );
  fail = false;
  clock += 11;
  assert.equal((await get()).length, 2);
  enabled = false;
  clock += 11;
  assert.deepEqual(
    (await get()).map((x) => x.id),
    ['b'],
  );
  assert.equal(get.status()[0].status, 'disabled');
});

test('an empty cold catalog is cached instead of repeatedly fetching on every frame request', async () => {
  let count = 0;
  const get = createCctvCatalog({
    sourceRoot: '/nonexistent-cctv-test',
    livePacks: [
      {
        name: 'offline',
        enabled: () => true,
        load: async () => {
          count++;
          return [];
        },
      },
    ],
  });
  await Promise.all([get(), get()]);
  await get();
  assert.equal(count, 1);
});
