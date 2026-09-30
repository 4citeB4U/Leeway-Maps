import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { ADDRESS_KEYS } from './addressStore.js';
import { OFFLINE_TRIP_KEY } from '../../public/offlineTripCore.js';
test('personal service worker activation preserves business and unrelated caches', async () => {
  const code = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const listeners = {}, deleted = [];
  vm.runInNewContext(code, { URL, Promise,
    self: {registration:{scope:'https://4citeb4u.github.io/Leeway-Maps/'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>{listeners[name]=fn;}},
    caches: {keys:async()=>['leeway-logistics-offline-v6','leeway-maps-offline-v2','leeway-maps-offline-v3','other'],delete:async key=>deleted.push(key)},
  });
  let completion;
  listeners.activate({waitUntil(promise){completion=promise;}});
  await completion;
  assert.deepEqual(deleted,['leeway-maps-offline-v2']);
});
test('personal saved trip and addresses never use business or ambiguous shared keys', () => {
  assert.equal(OFFLINE_TRIP_KEY,'leeway.maps.offlineTrip.v1');
  assert.equal(ADDRESS_KEYS.saved,'leeway.maps.addresses.saved.v1');
  assert.equal(ADDRESS_KEYS.recent,'leeway.maps.addresses.recent.v1');
});
