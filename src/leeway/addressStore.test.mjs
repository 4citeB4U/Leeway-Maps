import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressText,
  createAddressStore,
  importAddresses,
  exportAddresses,
  ADDRESS_KEYS,
} from './addressStore.js';
const memory = () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
};
test('address inputs reject coordinate forms while retaining ordinary addresses', () => {
  for (const value of [
    '41.88,-87.62',
    '91,0',
    '41.88 -87.62',
    'lat:41.8',
    '41° 52 N, 87° 37 W',
  ])
    assert.throws(() => addressText(value), /not coordinates/);
  assert.equal(
    addressText(' 123 West Main Street, Chicago, IL '),
    '123 West Main Street, Chicago, IL',
  );
  assert.equal(addressText('New'), 'New');
});
test('saved addresses survive reinitialization while recent addresses belong to a session', () => {
  const permanent = memory(),
    session = memory();
  const first = createAddressStore({ permanent, session });
  first.save({
    address: 'Union Station, Washington DC',
    point: { lat: 38.897, lon: -77.006 },
  });
  first.remember('Library of Congress, Washington DC');
  const reload = createAddressStore({ permanent, session });
  assert.equal(reload.list('saved')[0].point.lat, 38.897);
  assert.equal(reload.list('recent').length, 1);
  const newSession = createAddressStore({ permanent, session: memory() });
  assert.equal(newSession.list('saved').length, 1);
  assert.equal(newSession.list('recent').length, 0);
  reload.save('Union Station, Washington DC');
  assert.equal(reload.list('saved').length, 1);
  reload.remove(reload.list('saved')[0].id);
  assert.equal(reload.list('saved').length, 0);
});
test('malformed storage is recoverable and save failures are not reported as persisted', () => {
  const permanent = memory();
  permanent.setItem(ADDRESS_KEYS.saved, 'not json');
  const store = createAddressStore({ permanent, session: memory() });
  assert.deepEqual(store.list('saved'), []);
  store.save('Chicago Union Station');
  assert.equal(store.list('saved').length, 1);
  const broken = createAddressStore({
    permanent: {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    },
  });
  assert.throws(() => broken.save('Chicago Union Station'), /quota/);
});
test('JSON and quoted CSV import/export preserve address order and never export coordinates', () => {
  const stops = [
    {
      text: '100 Main Street, "West" Building',
      point: { lat: 38, lon: -77, label: '100 Main Street, "West" Building' },
    },
    { text: '200 Oak Avenue, Chicago, IL' },
  ];
  for (const format of ['json', 'csv']) {
    const output = exportAddresses(stops, format);
    assert.deepEqual(
      importAddresses(output, format),
      stops.map((s) => ({ text: s.text })),
    );
    assert.doesNotMatch(output, /"lat"|"lon"/);
  }
  assert.throws(
    () => importAddresses('["41,-87","New York"]'),
    /not coordinates/,
  );
  assert.throws(
    () => importAddresses('name\nChicago\nNew York', 'csv'),
    /address column/,
  );
  assert.throws(
    () => importAddresses('address\n"unfinished', 'csv'),
    /unclosed quote/,
  );
});
test('batch import supports ten intermediate stops and rejects over-capacity atomically', () => {
  const addresses = Array.from(
    { length: 12 },
    (_, i) => `${i + 1} Main Street, Chicago`,
  );
  assert.equal(importAddresses(JSON.stringify(addresses)).length, 12);
  assert.throws(
    () => importAddresses(JSON.stringify([...addresses, '20 Main Street'])),
    /2–12/,
  );
  assert.throws(() => importAddresses(JSON.stringify(['Main Street'])), /2–12/);
});
